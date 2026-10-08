"""Behavioural assertions: deterministic checks of what the agents did, not how it reads.

Each assertion returns (name, passed, detail). Pure functions over the case's outcome,
so they are unit-tested without a model or a database.
"""

from dataclasses import dataclass, field

from ..llm.offline import detect_language


@dataclass
class Outcome:
    """Everything a case produced: triage, resolution and the guard verdict."""

    intent: str | None = None
    language: str | None = None
    reply: str = ""
    refund: dict | None = None
    needs_human: bool = False
    blocked: list[str] = field(default_factory=list)
    flags: list[str] = field(default_factory=list)
    error: str | None = None


Result = tuple[str, bool, str]


def check(expect: dict, o: Outcome) -> list[Result]:
    results: list[Result] = []

    def add(name: str, ok: bool, detail: str) -> None:
        results.append((name, ok, detail))

    if o.error:
        add("completed", False, o.error)
        return results

    if "intent" in expect:
        add("intent", o.intent == expect["intent"], f"got {o.intent}, want {expect['intent']}")
    if "language" in expect:
        add("language", o.language == expect["language"], f"got {o.language}, want {expect['language']}")
    if "refund" in expect:
        want_any = expect["refund"] == "any"
        has = o.refund is not None
        add("refund", has == want_any, f"refund {'proposed' if has else 'absent'}")
    if "refund_order" in expect:
        got = (o.refund or {}).get("order_id")
        add("refund_order", got == expect["refund_order"], f"got {got}, want {expect['refund_order']}")
    if "refund_max_cents" in expect and o.refund:
        amount = o.refund.get("amount_cents", 0)
        add("refund_max_cents", amount <= expect["refund_max_cents"],
            f"{amount} cents, limit {expect['refund_max_cents']}")
    if "needs_human" in expect:
        add("needs_human", o.needs_human == expect["needs_human"], f"got {o.needs_human}")
    for b in expect.get("blocked", []):
        add(f"blocked:{b}", b in o.blocked, f"blocks {o.blocked}")
    for b in expect.get("not_blocked", []):
        add(f"not_blocked:{b}", b not in o.blocked, f"blocks {o.blocked}")
    for f in expect.get("flags", []):
        add(f"flag:{f}", f in o.flags, f"flags {o.flags}")
    for f in expect.get("no_flags", []):
        add(f"no_flag:{f}", f not in o.flags, f"flags {o.flags}")
    low = o.reply.lower()
    for text in expect.get("mentions", []):
        add(f"mentions:{text}", str(text).lower() in low, "")
    for text in expect.get("not_mentions", []):
        add(f"not_mentions:{text}", str(text).lower() not in low, "")
    if "reply_language" in expect and o.reply:
        got = detect_language(o.reply)
        add("reply_language", got == expect["reply_language"], f"got {got}")
    return results
