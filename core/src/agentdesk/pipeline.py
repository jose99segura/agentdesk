"""What happens to one ticket: triage, resolve, check, propose.

Idempotent: a retried job skips the stages that already succeeded, and a ticket that
already has proposals is left alone. The effects of the resolver (proposals, ticket
status, audit entry) are written in one transaction: all of them or none.
"""

import uuid
from dataclasses import dataclass

from psycopg import Connection
from psycopg.types.json import Jsonb

from .agents.runner import load_agent, run_resolver, run_triage
from .agents.schemas import Triage
from .gateway import Gateway
from .guards import check_resolution, ticket_flags
from .llm.router import ModelRouter
from .recorder import RunRecorder
from .tracing import tracer

DONE_STATUSES = ("awaiting_approval", "resolved", "needs_human")


@dataclass
class Outcome:
    status: str
    detail: str = ""


def _run(conn, router, agent_id, ticket, job_id, trace_id, body):
    """Run one agent with a recorder; the run is marked failed on any exception."""
    rec = RunRecorder(conn, agent_id=agent_id, ticket_id=str(ticket["id"]), job_id=job_id,
                      trace_id=trace_id)
    try:
        result = body(rec)
    except Exception as exc:
        rec.step("error", type(exc).__name__, "error", output={"error": str(exc)})
        rec.finish("failed", error=str(exc)[:1000], error_kind=type(exc).__name__)
        raise
    rec.finish("succeeded")
    return rec, result


def process_ticket(conn: Connection, router: ModelRouter, job: dict) -> Outcome:
    ticket = conn.execute("select * from tickets where id = %s", (job["ticket_id"],)).fetchone()
    if ticket is None:
        return Outcome("skipped", "ticket not found")
    if ticket["status"] in DONE_STATUSES:
        return Outcome("skipped", f"ticket already {ticket['status']}")

    trace_id = uuid.uuid4().hex
    tracer().trace(trace_id, name="process_ticket", sessionId=str(ticket["id"]),
                   input={"channel": ticket["channel"], "subject": ticket["subject"],
                          "body": ticket["body"]},
                   tags=[ticket["channel"]], metadata={"job_id": job["id"],
                                                        "attempt": job["attempts"]})

    # 1. Triage (skipped on a retry if it already succeeded).
    load_agent(conn, "triage")
    if ticket["intent"]:
        triage = Triage(intent=ticket["intent"], language=ticket["language"],
                        urgency=ticket["urgency"] or "normal", summary="")
    else:
        _, triage = _run(conn, router, "triage", ticket, job["id"], trace_id,
                         lambda rec: run_triage(router, ticket, rec))
        conn.execute(
            """update tickets set intent = %s, language = %s, urgency = %s, status = 'triaged'
               where id = %s""",
            (triage.intent, triage.language, triage.urgency, ticket["id"]),
        )

    # 2. Resolve with granted tools only.
    resolver = load_agent(conn, "resolver")
    holder: dict = {}

    def resolve(rec: RunRecorder):
        gateway = Gateway(conn, list(resolver["tools"]), ticket["customer_email"], rec)
        holder["gateway"] = gateway
        return run_resolver(router, ticket, triage, gateway, rec)

    rec, resolution = _run(conn, router, "resolver", ticket, job["id"], trace_id, resolve)

    # 3. Guards: block what a reviewer could miss, flag what deserves a second look.
    guard = check_resolution(conn, ticket["customer_email"], resolution,
                             holder["gateway"].known_orders())
    flags = guard.flags + ticket_flags(ticket["body"])
    if resolution.needs_human:
        flags.append("agent_requested_human")
    rec.step("guard", "output checks", "blocked" if guard.blocked else "ok",
             output={"blocked": guard.blocked, "flags": flags})

    # 4. Effects, atomically.
    with conn.transaction():
        if guard.blocked:
            conn.execute("update tickets set status = 'needs_human' where id = %s", (ticket["id"],))
            conn.execute(
                "insert into audit_log (actor, action, subject, detail) values (%s, %s, %s, %s)",
                ("agent:resolver", "guard_blocked", str(ticket["id"]),
                 Jsonb({"run_id": rec.run_id, "blocked": guard.blocked})),
            )
            outcome = Outcome("needs_human", ", ".join(guard.blocked))
        else:
            conn.execute(
                """insert into proposals (ticket_id, run_id, kind, tier, payload, flags)
                   values (%s, %s, 'send_reply', 2, %s, %s)""",
                (ticket["id"], rec.run_id, Jsonb({"body": resolution.reply,
                                                   "summary": resolution.summary}), flags),
            )
            if resolution.refund:
                conn.execute(
                    """insert into proposals (ticket_id, run_id, kind, tier, payload, flags)
                       values (%s, %s, 'refund', 3, %s, %s)""",
                    (ticket["id"], rec.run_id, Jsonb(resolution.refund.model_dump()), flags),
                )
            conn.execute("update tickets set status = 'awaiting_approval' where id = %s",
                         (ticket["id"],))
            conn.execute(
                "insert into audit_log (actor, action, subject, detail) values (%s, %s, %s, %s)",
                ("agent:resolver", "proposed", str(ticket["id"]),
                 Jsonb({"run_id": rec.run_id, "refund": bool(resolution.refund),
                        "flags": flags})),
            )
            outcome = Outcome("awaiting_approval")

    tracer().trace(trace_id, output={"outcome": outcome.status, "detail": outcome.detail,
                                     "reply": resolution.reply})
    return outcome
