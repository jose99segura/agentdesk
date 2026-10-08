"""Checks on what an agent produced, before anything is proposed to a human.

A *block* means the output is wrong in a way a reviewer might miss (an order that
does not exist, a refund larger than the order, another customer's data): the run
fails and the ticket goes to a person. A *flag* rides along on the proposal so the
reviewer looks twice. Refunds are checked against the database, not against what the
model claims to have seen.
"""

import re
from dataclasses import dataclass, field

from psycopg import Connection

from .agents.schemas import Resolution

ORDER_RE = re.compile(r"\bORD-\d{4,6}\b", re.IGNORECASE)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
COMMITMENT_RE = re.compile(
    r"\b(guarantee[ds]?|will (arrive|be delivered) (on|by|tomorrow)|garantiz\w*|"
    r"llegará (el|mañana|antes)|garanti\w*|arrivera (le|demain|avant))\b",
    re.IGNORECASE,
)
NEGATION_RE = re.compile(
    r"\b(not|cannot|can['’]t|won['’]t|can not|unable to|no|never|ne|pas|no podemos|sin)\b[\w\s,'’]{0,25}$",
    re.IGNORECASE,
)
URL_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
INJECTION_RE = re.compile(
    r"(ignore (all |the )?(previous|above) instructions|system prompt|you are now|"
    r"ignora (las|todas las) instrucciones|ignore[zr]? les instructions)",
    re.IGNORECASE,
)
MAX_REPLY_CHARS = 2000


@dataclass
class GuardResult:
    blocked: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)


def has_commitment(text: str) -> bool:
    """A promise of a date or outcome. "We cannot guarantee a date" is the opposite of one."""
    for m in COMMITMENT_RE.finditer(text):
        if not NEGATION_RE.search(text[max(0, m.start() - 30):m.start()]):
            return True
    return False


def ticket_flags(body: str) -> list[str]:
    return ["possible_prompt_injection"] if INJECTION_RE.search(body) else []


def check_resolution(conn: Connection, sender: str, resolution: Resolution,
                     known_orders: dict[str, dict]) -> GuardResult:
    result = GuardResult()
    reply = resolution.reply

    mentioned = {m.upper() for m in ORDER_RE.findall(reply)}
    if mentioned - known_orders.keys():
        result.blocked.append("invented_order")

    if any(e.lower() != sender.lower() for e in EMAIL_RE.findall(reply)):
        result.blocked.append("foreign_email")

    if has_commitment(reply):
        result.flags.append("commitment_language")
    if URL_RE.search(reply):
        # Agents have no tool that returns links: any URL in a reply was made up.
        result.flags.append("link_in_reply")
    if len(reply) > MAX_REPLY_CHARS:
        result.flags.append("long_reply")

    if resolution.refund:
        order = conn.execute(
            """select o.status::text, o.total_cents,
                      coalesce((select sum(amount_cents) from refunds r where r.order_id = o.id), 0)
                        as refunded
               from orders o join customers c on c.id = o.customer_id
               where o.id = %s and c.email = %s""",
            (resolution.refund.order_id.upper(), sender),
        ).fetchone()
        if not order:
            result.blocked.append("refund_wrong_customer")
        elif resolution.refund.amount_cents > order["total_cents"] - order["refunded"]:
            result.blocked.append("refund_exceeds_order")
        elif order["status"] == "processing":
            result.blocked.append("refund_not_refundable")
    return result
