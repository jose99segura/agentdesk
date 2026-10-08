"""Langfuse tracing through its public ingestion API.

Fire and forget: events go into an in-memory queue and a background thread ships
them in batches. A tracing failure is logged and dropped; it never slows down or
breaks an agent run. Without keys every call is a no-op.
"""

import atexit
import logging
import queue
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx

from .config import settings

log = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


class Tracer:
    def __init__(self) -> None:
        cfg = settings()
        self.enabled = bool(cfg.langfuse_public_key and cfg.langfuse_secret_key)
        self.host = cfg.langfuse_host.rstrip("/")
        self.project_id = cfg.langfuse_project_id
        self.environment = cfg.langfuse_environment
        self._queue: queue.Queue[dict] = queue.Queue(maxsize=10_000)
        if self.enabled:
            self._client = httpx.Client(
                base_url=self.host,
                auth=(cfg.langfuse_public_key, cfg.langfuse_secret_key),
                timeout=10.0,
            )
            if not self.project_id:
                self._discover_project()
            threading.Thread(target=self._ship_forever, daemon=True, name="langfuse").start()
            atexit.register(self.flush)

    def _discover_project(self) -> None:
        try:
            res = self._client.get("/api/public/projects", timeout=5)
            res.raise_for_status()
            projects = res.json().get("data") or []
            if projects:
                self.project_id = projects[0]["id"]
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            log.warning("could not discover the Langfuse project id: %s", exc)

    def trace_url(self, trace_id: str) -> str | None:
        if not self.enabled or not self.project_id:
            return None
        return f"{self.host}/project/{self.project_id}/traces/{trace_id}"

    def trace(self, trace_id: str, **body: Any) -> None:
        self._emit("trace-create", {"id": trace_id, "timestamp": now_iso(), **body})

    def generation(self, trace_id: str, **body: Any) -> None:
        self._emit("generation-create", {"id": uuid.uuid4().hex, "traceId": trace_id, **body})

    def span(self, trace_id: str, **body: Any) -> None:
        self._emit("span-create", {"id": uuid.uuid4().hex, "traceId": trace_id, **body})

    def _emit(self, kind: str, body: dict) -> None:
        if not self.enabled:
            return
        body.setdefault("environment", self.environment)
        event = {"id": uuid.uuid4().hex, "timestamp": now_iso(), "type": kind, "body": body}
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            log.warning("langfuse queue full, dropping %s", kind)

    def _drain(self, limit: int = 100) -> list[dict]:
        batch: list[dict] = []
        while len(batch) < limit:
            try:
                batch.append(self._queue.get_nowait())
            except queue.Empty:
                break
        return batch

    def _send(self, batch: list[dict]) -> None:
        if not batch:
            return
        try:
            res = self._client.post("/api/public/ingestion", json={"batch": batch})
            if res.status_code >= 400:
                log.warning("langfuse ingestion HTTP %s: %s", res.status_code, res.text[:200])
        except httpx.HTTPError as exc:
            log.warning("langfuse ingestion failed: %s", exc)

    def _ship_forever(self) -> None:
        while True:
            first = self._queue.get()
            self._send([first, *self._drain(99)])

    def flush(self) -> None:
        if self.enabled:
            self._send(self._drain(1000))


_tracer: Tracer | None = None
_lock = threading.Lock()


def tracer() -> Tracer:
    global _tracer
    with _lock:
        if _tracer is None:
            _tracer = Tracer()
        return _tracer
