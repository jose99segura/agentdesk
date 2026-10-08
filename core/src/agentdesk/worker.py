"""The worker: N threads claiming jobs, one listener waking them on NOTIFY."""

import logging
import signal
import threading
import time
import traceback

import psycopg
from psycopg.types.json import Jsonb

from . import jobs
from .agents.runner import AgentNotRegistered
from .config import settings
from .db import agent_pool
from .llm import build_router
from .llm.router import CircuitBreaker
from .pipeline import process_ticket
from .tracing import tracer

log = logging.getLogger("agentdesk.worker")

PERMANENT = (AgentNotRegistered,)


class ChaosFlags:
    """Fault injection flags from the `chaos` table, cached for two seconds."""

    def __init__(self):
        self._at = 0.0
        self._failing: set[str] = set()
        self._lock = threading.Lock()

    def __call__(self, provider: str) -> bool:
        with self._lock:
            if time.monotonic() - self._at > 2:
                with agent_pool().connection() as conn:
                    rows = conn.execute("select provider from chaos where fail").fetchall()
                self._failing = {r["provider"] for r in rows}
                self._at = time.monotonic()
            return provider in self._failing


def publish_health(provider: str, breaker: CircuitBreaker) -> None:
    try:
        with agent_pool().connection() as conn:
            conn.execute(
                """insert into provider_health (provider, state, consecutive_failures, last_error)
                   values (%s, %s, %s, %s)
                   on conflict (provider) do update set state = excluded.state,
                     consecutive_failures = excluded.consecutive_failures,
                     last_error = excluded.last_error, updated_at = now()""",
                (provider, breaker.state, breaker.consecutive_failures, breaker.last_error),
            )
    except psycopg.Error:
        log.exception("could not publish health for %s", provider)


class Worker:
    def __init__(self):
        cfg = settings()
        self.cfg = cfg
        self.router = build_router(cfg, ChaosFlags(), publish_health)
        self.wake = threading.Event()
        self.stopping = threading.Event()

    def run(self) -> None:
        names = [p.name for p in self.router.providers]
        log.info("worker %s starting, %d threads, models: %s",
                 self.cfg.worker_id, self.cfg.worker_concurrency, " -> ".join(names))
        for name, breaker in self.router.breakers.items():
            publish_health(name, breaker)
        threading.Thread(target=self._listen, daemon=True, name="listen").start()
        threads = [threading.Thread(target=self._loop, args=(i,), name=f"w{i}")
                   for i in range(self.cfg.worker_concurrency)]
        for t in threads:
            t.start()
        try:
            while not self.stopping.is_set():
                with agent_pool().connection() as conn:
                    if n := jobs.reclaim_expired(conn):
                        log.warning("reclaimed %d jobs with expired leases", n)
                self.stopping.wait(30)
        finally:
            self.stopping.set()
            self.wake.set()
            for t in threads:
                t.join(timeout=60)
            tracer().flush()

    def stop(self, *_):
        log.info("stopping: finishing jobs in flight")
        self.stopping.set()
        self.wake.set()

    def _listen(self) -> None:
        while not self.stopping.is_set():
            try:
                with psycopg.connect(self.cfg.database_url_agent, autocommit=True) as conn:
                    conn.execute("listen jobs")
                    for _ in conn.notifies(timeout=5):
                        self.wake.set()
            except psycopg.Error:
                log.warning("listener lost its connection, reconnecting")
                time.sleep(2)

    def _loop(self, index: int) -> None:
        worker_id = f"{self.cfg.worker_id}/{index}"
        while not self.stopping.is_set():
            try:
                with agent_pool().connection() as conn:
                    job = jobs.claim(conn, worker_id)
                    if job:
                        self._handle(conn, job)
                        continue
            except psycopg.OperationalError:
                log.exception("database unavailable")
                time.sleep(3)
                continue
            self.wake.wait(timeout=1.0)
            self.wake.clear()

    def drain(self, worker_id: str, budget_s: float) -> int:
        """Process due jobs until there are none or the time budget is spent (request mode)."""
        deadline = time.monotonic() + budget_s
        done = 0
        while time.monotonic() < deadline:
            with agent_pool().connection() as conn:
                job = jobs.claim(conn, worker_id)
                if not job:
                    break
                self._handle(conn, job)
                done += 1
        return done

    def _handle(self, conn, job: dict) -> None:
        started = time.monotonic()
        try:
            outcome = process_ticket(conn, self.router, job)
        except Exception as exc:
            permanent = isinstance(exc, PERMANENT)
            error = f"{type(exc).__name__}: {exc}"
            status = jobs.fail(conn, job, error, permanent=permanent)
            log.warning("job %s attempt %s failed (%s): %s", job["id"], job["attempts"], status, error)
            if status == "dead":
                self._on_dead(conn, job, error, traceback.format_exc(limit=5))
            return
        jobs.complete(conn, job["id"])
        log.info("job %s %s in %.1fs %s", job["id"], outcome.status,
                 time.monotonic() - started, outcome.detail)

    @staticmethod
    def _on_dead(conn, job: dict, error: str, trace: str) -> None:
        with conn.transaction():
            conn.execute("update tickets set status = 'failed' where id = %s", (job["ticket_id"],))
            conn.execute(
                "insert into audit_log (actor, action, subject, detail) values (%s, %s, %s, %s)",
                ("worker", "job_dead", str(job["id"]),
                 Jsonb({"ticket_id": str(job["ticket_id"]), "error": error, "trace": trace})),
            )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    worker = Worker()
    signal.signal(signal.SIGINT, worker.stop)
    signal.signal(signal.SIGTERM, worker.stop)
    worker.run()
