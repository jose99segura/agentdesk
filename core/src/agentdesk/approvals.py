"""Executing what a human approved. The only code path that refunds or sends.

It runs on the `desk_api` role and re-validates everything: the proposal made a round
trip through a browser, and the order may have changed since the agent looked at it.
The recipient is always the ticket's sender, never a field of the proposal.
"""

from psycopg import Connection
from psycopg.types.json import Jsonb


class DecisionError(Exception):
    pass


def decide(conn: Connection, proposal_id: str, approve: bool, actor: str) -> dict:
    with conn.transaction():
        p = conn.execute("select * from proposals where id = %s for update",
                         (proposal_id,)).fetchone()
        if p is None:
            raise DecisionError("proposal not found")
        if p["status"] != "pending":
            return {"status": p["status"], "already_decided": True}
        ticket = conn.execute("select * from tickets where id = %s", (p["ticket_id"],)).fetchone()

        if not approve:
            conn.execute(
                """update proposals set status = 'rejected', decided_by = %s, decided_at = now()
                   where id = %s""",
                (actor, proposal_id),
            )
            _audit(conn, actor, "rejected", p, {})
            _settle_ticket(conn, ticket["id"])
            return {"status": "rejected"}

        if p["kind"] == "send_reply":
            result = _send_reply(conn, p, ticket)
        elif p["kind"] == "refund":
            result = _refund(conn, p, ticket, actor)
        else:
            raise DecisionError(f"unknown proposal kind {p['kind']}")

        conn.execute(
            """update proposals set status = 'executed', decided_by = %s, decided_at = now(),
                 executed_at = now(), result = %s where id = %s""",
            (actor, Jsonb(result), proposal_id),
        )
        _audit(conn, actor, f"executed_{p['kind']}", p, result)
        _settle_ticket(conn, ticket["id"])
        return {"status": "executed", "result": result}


def _send_reply(conn: Connection, p: dict, ticket: dict) -> dict:
    # Phase 0 records the message in an outbox; delivery adapters (email, chat) read it.
    row = conn.execute(
        """insert into outbound_messages (ticket_id, proposal_id, channel, recipient, body)
           values (%s, %s, %s, %s, %s) returning id""",
        (ticket["id"], p["id"], ticket["channel"], ticket["customer_email"], p["payload"]["body"]),
    ).fetchone()
    return {"message_id": str(row["id"]), "recipient": ticket["customer_email"]}


def _refund(conn: Connection, p: dict, ticket: dict, actor: str) -> dict:
    payload = p["payload"]
    order = conn.execute(
        """select o.id, o.status::text, o.total_cents,
                  coalesce((select sum(amount_cents) from refunds r where r.order_id = o.id), 0)
                    as refunded
           from orders o join customers c on c.id = o.customer_id
           where o.id = %s and c.email = %s for update of o""",
        (payload["order_id"], ticket["customer_email"]),
    ).fetchone()
    amount = int(payload["amount_cents"])
    if order is None:
        raise DecisionError("order does not belong to the ticket's customer")
    if amount <= 0 or amount > order["total_cents"] - order["refunded"]:
        raise DecisionError("refund exceeds what is left to refund on this order")
    if order["status"] == "processing":
        raise DecisionError("order has not shipped: cancel it instead of refunding")
    row = conn.execute(
        """insert into refunds (order_id, amount_cents, reason, proposal_id, approved_by)
           values (%s, %s, %s, %s, %s) returning id""",
        (order["id"], amount, payload["reason"], p["id"], actor),
    ).fetchone()
    return {"refund_id": str(row["id"]), "order_id": order["id"], "amount_cents": amount}


def _settle_ticket(conn: Connection, ticket_id) -> None:
    pending = conn.execute(
        "select count(*) as n from proposals where ticket_id = %s and status = 'pending'",
        (ticket_id,),
    ).fetchone()["n"]
    if pending == 0:
        conn.execute(
            "update tickets set status = 'resolved' where id = %s and status = 'awaiting_approval'",
            (ticket_id,),
        )


def _audit(conn: Connection, actor: str, action: str, p: dict, detail: dict) -> None:
    conn.execute(
        "insert into audit_log (actor, action, subject, detail) values (%s, %s, %s, %s)",
        (f"human:{actor}", action, str(p["id"]),
         Jsonb({"ticket_id": str(p["ticket_id"]), "kind": p["kind"], **detail})),
    )
