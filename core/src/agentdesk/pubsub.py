"""Publishing the "there is work" message to Pub/Sub, from Cloud Run.

Uses the service account of the running container through the metadata server, so no
key file exists anywhere. Best effort by design: if a publish fails, the job is already
safe in the Postgres queue and the next scheduled sweep (within a minute) picks it up.
"""

import base64
import logging
import threading
import time

import httpx

from .config import settings

log = logging.getLogger(__name__)
METADATA_TOKEN = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"

_token: tuple[str, float] | None = None
_lock = threading.Lock()


def _access_token() -> str:
    global _token
    with _lock:
        if _token and _token[1] - 60 > time.time():
            return _token[0]
        res = httpx.get(METADATA_TOKEN, headers={"Metadata-Flavor": "Google"}, timeout=5)
        res.raise_for_status()
        data = res.json()
        _token = (data["access_token"], time.time() + data["expires_in"])
        return _token[0]


def wake_workers(ticket_id: str) -> None:
    topic = settings().pubsub_topic
    if not topic:
        return  # local development: the worker loop is woken by LISTEN/NOTIFY
    try:
        res = httpx.post(
            f"https://pubsub.googleapis.com/v1/{topic}:publish",
            headers={"Authorization": f"Bearer {_access_token()}"},
            json={"messages": [{"data": base64.b64encode(ticket_id.encode()).decode()}]},
            timeout=5,
        )
        res.raise_for_status()
    except httpx.HTTPError as exc:
        log.warning("pubsub publish failed, the scheduled sweep will pick the job up: %s", exc)
