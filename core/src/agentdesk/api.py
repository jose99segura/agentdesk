"""HTTP API: ingest tickets (n8n, voice, simulator), decide proposals, operate the queue."""

import hashlib
import hmac
from functools import lru_cache
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from psycopg.types.json import Jsonb
from pydantic import BaseModel, EmailStr, Field

from . import jobs
from .approvals import DecisionError, decide
from .config import settings
from .db import agent_pool, api_pool
from .pubsub import wake_workers

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


@app.get("/livez")
def livez() -> dict:
    """Cloud Run's startup probe: the process serves. /health also checks the database."""
    return {"ok": True}


@app.get("/meta")
def meta() -> dict:
    """Prompts, tool schemas and reliability settings, straight from the running code."""
    from .meta import describe

    return describe()


class SimulateIn(BaseModel):
    count: int = Field(default=1, ge=1, le=20)


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
    # After the commit, so a worker woken by the message always finds the job.
    wake_workers(str(row["id"]))
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
    wake_workers(f"retry:{job_id}")
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


@app.post("/simulate", dependencies=[Depends(require_token)])
def simulate(s: SimulateIn) -> dict:
    """Synthetic customer tickets, for a scheduler (the n8n traffic generator) to call."""
    import random

    from .simulator import make_ticket

    rng = random.Random()
    created = [create_ticket(TicketIn(**make_ticket(rng))) for _ in range(s.count)]
    return {"created": len(created), "tickets": [c["ticket_id"] for c in created]}


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ExplainIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=12)


@lru_cache
def explainer_router():
    """The same router the worker uses: retries, fallback, breakers, fault injection."""
    from .llm import build_router
    from .worker import ChaosFlags, publish_health

    return build_router(settings(), ChaosFlags(), publish_health)


@app.post("/explain", dependencies=[Depends(require_token)])
def explain(q: ExplainIn) -> dict:
    """Ask the guide: the registered explainer agent, recorded as a run like any other."""
    from .agents.runner import AgentNotRegistered
    from .explain import answer
    from .llm.types import AllProvidersFailed
    from .meta import describe

    with agent_pool().connection() as conn:
        try:
            return answer(conn, explainer_router(), q.question,
                          [t.model_dump() for t in q.history], describe())
        except AgentNotRegistered as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except AllProvidersFailed as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/stats", dependencies=[Depends(require_token)])
def stats() -> dict:
    """The day in numbers, for the daily report."""
    with api_pool().connection() as conn:
        kpis = conn.execute("select * from dashboard_kpis").fetchone()
        last_eval = conn.execute(
            """select started_at, cases, passed, safety_failed, pass_rate, gate_passed
               from eval_runs where finished_at is not null order by started_at desc limit 1"""
        ).fetchone()
        decided = conn.execute(
            """select status, count(*) as n from proposals
               where decided_at > now() - interval '24 hours' group by status"""
        ).fetchall()
    return {"kpis": kpis, "last_eval": last_eval,
            "decisions_24h": {r["status"]: r["n"] for r in decided}}


from . import shop  # noqa: E402  (registered after require_token exists)

shop.include(app, require_token)

from . import voice  # noqa: E402

voice.include(app, require_token)


@app.post("/telegram/webhook")
def telegram_webhook(update: dict, x_telegram_bot_api_secret_token: str = Header(default="")) -> dict:
    """Button presses from Telegram, in production (locally the service long-polls instead).

    Telegram sends the secret registered with setWebhook in a header; anything without it
    is refused. The callback itself is checked against the configured chat, as in polling.
    """
    cfg = settings()
    secret = cfg.telegram_webhook_secret or ""
    if not secret or not hmac.compare_digest(x_telegram_bot_api_secret_token.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="invalid secret")
    if cb := update.get("callback_query"):
        from .telegram import Bot, TelegramService

        service = TelegramService(Bot(cfg.telegram_bot_token), cfg.telegram_chat_id,
                                  cfg.telegram_cards_per_hour, cfg.dashboard_url)
        with api_pool().connection() as conn:
            service.handle_callback(conn, cb)
    return {"ok": True}
