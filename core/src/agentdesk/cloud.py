"""The worker as an HTTP service, for Cloud Run.

Locally the worker is a long-running loop woken by LISTEN/NOTIFY. On Cloud Run nothing
runs between requests (that is what makes it nearly free), so the same work is driven
by two callers instead:

- Pub/Sub pushes a message to POST /pubsub whenever the API enqueues a ticket: the
  service drains the queue and returns.
- Cloud Scheduler calls POST /sweep every minute: it reclaims jobs whose worker died,
  runs retries whose backoff has expired, and does Telegram's outbox (approval cards,
  digest, deduplicated alerts).

The Postgres queue stays the source of truth: Pub/Sub is only a wake-up call, so a lost
or duplicated message changes nothing. Both endpoints are private; Cloud Run only lets
in callers holding the invoker role (the Pub/Sub and Scheduler service accounts).
"""

import logging
import os

from fastapi import FastAPI, Response

from . import jobs
from .config import settings
from .db import agent_pool, api_pool
from .tracing import tracer
from .worker import Worker

log = logging.getLogger("agentdesk.cloud")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

app = FastAPI(title="agentdesk worker", version="0.1.0")
_worker: Worker | None = None
# Cloud Run gives a request up to the configured timeout; leave room to answer.
BUDGET_S = float(os.environ.get("DRAIN_BUDGET_S", "240"))


def worker() -> Worker:
    global _worker
    if _worker is None:
        _worker = Worker()
    return _worker


def _instance() -> str:
    return f"{settings().worker_id}/{os.environ.get('K_REVISION', 'local')}"


@app.get("/health")
def health() -> dict:
    with agent_pool().connection() as conn:
        conn.execute("select 1")
    return {"ok": True}


@app.get("/livez")
def livez() -> dict:
    return {"ok": True}


@app.post("/pubsub")
def on_message() -> Response:
    # The message only says "there is work"; which job is decided by the queue.
    done = worker().drain(_instance(), BUDGET_S)
    tracer().flush()
    log.info("pubsub wake-up: %d jobs", done)
    return Response(status_code=204)


@app.post("/sweep")
def sweep() -> dict:
    with agent_pool().connection() as conn:
        reclaimed = jobs.reclaim_expired(conn)
    done = worker().drain(_instance(), BUDGET_S)
    notified = _telegram_outbox()
    tracer().flush()
    return {"reclaimed": reclaimed, "processed": done, "telegram": notified}


def _telegram_outbox() -> bool:
    cfg = settings()
    if not (cfg.telegram_bot_token and cfg.telegram_chat_id):
        return False
    from .telegram import Bot, TelegramService

    service = TelegramService(Bot(cfg.telegram_bot_token), cfg.telegram_chat_id,
                              cfg.telegram_cards_per_hour, cfg.dashboard_url, interactive=True)
    try:
        with api_pool().connection() as conn:
            service.announce(conn)
            service.check_alerts(conn)
    except Exception:
        log.exception("telegram outbox failed")
        return False
    return True
