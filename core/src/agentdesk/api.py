"""HTTP API: ingest tickets (n8n, voice, simulator), decide proposals, operate the queue."""

import hashlib
import hmac
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, EmailStr, Field

from . import jobs
from .approvals import DecisionError, decide
from .config import settings
from .db import api_pool

app = FastAPI(title="agentdesk", version="0.1.0")


def require_token(authorization: str = Header(default="")) -> None:
    expected = f"Bearer {settings().api_token}"
    if not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="invalid token")


class TicketIn(BaseModel):
    channel: Literal["email", "chat", "voice", "form"]
    customer_email: EmailStr
    subject: str | None = Field(default=None, max_length=300)
    body: str = Field(min_length=1, max_length=10_000)
    # The sender's own message id makes a redelivered webhook a no-op.
    external_id: str | None = Field(default=None, max_length=300)


class Decision(BaseModel):
    approve: bool
    actor: str = Field(min_length=1, max_length=100)


class ChaosIn(BaseModel):
    fail: bool


@app.get("/health")
def health() -> dict:
    with api_pool().connection() as conn:
        conn.execute("select 1")
    return {"ok": True}


@app.post("/tickets", dependencies=[Depends(require_token)])
def create_ticket(t: TicketIn) -> dict:
    external_id = t.external_id or hashlib.sha256(
        f"{t.channel}|{t.customer_email}|{t.subject}|{t.body}".encode()
    ).hexdigest()
    with api_pool().connection() as conn, conn.transaction():
        row = conn.execute(
            """insert into tickets (external_id, channel, customer_email, subject, body)
               values (%s, %s, %s, %s, %s)
               on conflict (external_id) do nothing returning id""",
            (external_id, t.channel, t.customer_email.lower(), t.subject, t.body),
        ).fetchone()
        if row is None:
            existing = conn.execute("select id from tickets where external_id = %s",
                                    (external_id,)).fetchone()
            return {"ticket_id": str(existing["id"]), "duplicate": True}
        jobs.enqueue(conn, "process_ticket", row["id"], f"process_ticket:{row['id']}")
    return {"ticket_id": str(row["id"]), "duplicate": False}


@app.post("/proposals/{proposal_id}/decision", dependencies=[Depends(require_token)])
def decide_proposal(proposal_id: str, d: Decision) -> dict:
    with api_pool().connection() as conn:
        try:
            return decide(conn, proposal_id, d.approve, d.actor)
        except DecisionError as exc:
            conn.execute(
                """update proposals set status = 'failed', decided_by = %s, decided_at = now(),
                     result = %s where id = %s and status = 'pending'""",
                (d.actor, Jsonb({"error": str(exc)}), proposal_id),
            )
            raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/jobs/{job_id}/retry", dependencies=[Depends(require_token)])
def retry_job(job_id: int) -> dict:
    with api_pool().connection() as conn:
        if not jobs.retry_dead(conn, job_id):
            raise HTTPException(status_code=409, detail="job is not in the dead letter queue")
        conn.execute(
            "insert into audit_log (actor, action, subject) values ('human:dashboard', 'retry_dead', %s)",
            (str(job_id),),
        )
    return {"ok": True}


@app.post("/chaos/{provider}", dependencies=[Depends(require_token)])
def set_chaos(provider: Literal["mistral", "anthropic", "offline"], c: ChaosIn) -> dict:
    with api_pool().connection() as conn:
        conn.execute(
            """insert into chaos (provider, fail) values (%s, %s)
               on conflict (provider) do update set fail = excluded.fail, updated_at = now()""",
            (provider, c.fail),
        )
        conn.execute(
            "insert into audit_log (actor, action, subject, detail) values (%s, %s, %s, %s)",
            ("human:dashboard", "chaos", provider, Jsonb({"fail": c.fail})),
        )
    return {"provider": provider, "fail": c.fail}
