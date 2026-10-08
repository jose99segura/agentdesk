"""The voice channel: an ElevenLabs agent (ElevenAgents) that answers the store's phone.

The voice agent runs on ElevenLabs; agentdesk gives it two server tools and keeps every
rule the chat agents follow:

- **Who is calling is not the model's choice.** The dashboard asks `GET /voice/session`
  for a conversation token; the API signs the customer's email into a short-lived `caller`
  value that the agent passes back on every tool call. A tool call with a forged, expired
  or missing `caller` is refused. The browser cannot claim to be somebody else, and the
  model cannot look up another customer's orders.
- **Voice reads, it never acts.** `order_status` runs on the `desk_agent` role, the same
  read-only gateway functions the chat agents use. `open_ticket` files a normal `voice`
  ticket, which goes through the same agents and the same human approval: the voice agent
  can promise that a person will look at a refund, never that it is done.
- **Every call is traced.** Each tool call is a span on a Langfuse trace named after the
  ElevenLabs conversation; the post-call webhook (HMAC-signed) adds the transcript and the
  call's outcome to that trace and to the audit log.
"""

import base64
import hashlib
import hmac
import json
import logging
import time

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from .config import settings
from .db import agent_pool, api_pool
from .gateway import NoArgs, OrderArgs, _get_order, _list_orders
from .tracing import now_iso, tracer

log = logging.getLogger(__name__)

ELEVEN = "https://api.elevenlabs.io"
CALLER_TTL_S = 30 * 60
WEBHOOK_TOLERANCE_S = 30 * 60


# --- caller binding -------------------------------------------------------------------

def _caller_key() -> bytes:
    secret = settings().voice_tool_secret
    if not secret:
        raise HTTPException(status_code=503, detail="voice channel not configured")
    return hashlib.sha256(b"caller|" + secret.encode()).digest()


def sign_caller(email: str, now: float | None = None) -> str:
    """`<b64 email>.<expiry>.<hmac>`: opaque to the model, checkable by the API."""
    expiry = int((time.time() if now is None else now) + CALLER_TTL_S)
    who = base64.urlsafe_b64encode(email.lower().encode()).decode().rstrip("=")
    mac = hmac.new(_caller_key(), f"{who}.{expiry}".encode(), hashlib.sha256).hexdigest()[:32]
    return f"{who}.{expiry}.{mac}"


def verify_caller(caller: str, now: float | None = None, allow_expired: bool = False) -> str:
    try:
        who, expiry, mac = caller.strip().split(".")
        good = hmac.new(_caller_key(), f"{who}.{expiry}".encode(), hashlib.sha256).hexdigest()[:32]
        if not hmac.compare_digest(mac, good):
            raise ValueError("bad signature")
        if not allow_expired and int(expiry) < (time.time() if now is None else now):
            raise ValueError("expired")
        return base64.urlsafe_b64decode(who + "=" * (-len(who) % 4)).decode()
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=403, detail="caller not verified") from exc


# --- tool endpoints (called by ElevenLabs) ------------------------------------------------

def require_tool_secret(x_agentdesk_voice: str = Header(default="")) -> None:
    secret = settings().voice_tool_secret or ""
    if not secret or not hmac.compare_digest(x_agentdesk_voice.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="invalid voice tool secret")


tools = APIRouter(prefix="/voice/tools", dependencies=[Depends(require_tool_secret)])


class OrderStatusIn(BaseModel):
    caller: str
    conversation_id: str = ""
    order_id: str | None = Field(default=None, max_length=40)


class OpenTicketIn(BaseModel):
    caller: str
    conversation_id: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=5, max_length=2000)
    order_id: str | None = Field(default=None, max_length=40)


def _span(conversation_id: str, name: str, input: dict, output: dict, started: float) -> None:
    if not conversation_id:
        return
    t = tracer()
    t.trace(f"voice-{conversation_id}", name="voice-call", tags=["voice"],
            metadata={"conversation_id": conversation_id})
    t.span(f"voice-{conversation_id}", name=f"tool:{name}", input=input, output=output,
           startTime=now_iso(), metadata={"latency_ms": int((time.monotonic() - started) * 1000)})


@tools.post("/order_status")
def order_status(body: OrderStatusIn) -> dict:
    started = time.monotonic()
    email = verify_caller(body.caller)
    with agent_pool().connection() as conn:
        if body.order_id:
            result = _get_order(conn, email, OrderArgs(order_id=body.order_id))
        else:
            result = _list_orders(conn, email, NoArgs())
    result = json.loads(json.dumps(result, default=str))
    _span(body.conversation_id, "order_status", {"order_id": body.order_id}, result, started)
    return result


@tools.post("/open_ticket")
def open_ticket(body: OpenTicketIn) -> dict:
    """File the call as a ticket; the chat agents and a person take it from there."""
    from .api import TicketIn, create_ticket

    started = time.monotonic()
    email = verify_caller(body.caller)
    text = body.summary.strip()
    if body.order_id and body.order_id.upper() not in text.upper():
        text += f"\n\nOrder: {body.order_id.upper()}"
    created = create_ticket(TicketIn(
        channel="voice", customer_email=email,
        subject=f"Phone call{f' about {body.order_id.upper()}' if body.order_id else ''}",
        body=text, external_id=f"voice-{body.conversation_id}",
    ))
    out = {**created, "next": "A person on the team reviews the reply, and any refund, before it is sent. "
                              "The customer will see the answer in the store's support chat."}
    _span(body.conversation_id, "open_ticket", body.model_dump(exclude={"caller"}), out, started)
    return out


# --- session (called by the dashboard's server) -----------------------------------------

session = APIRouter(prefix="/voice")
webhook = APIRouter(prefix="/voice")


@session.get("/session")
def start_session(email: str) -> dict:
    cfg = settings()
    if not (cfg.elevenlabs_api_key and cfg.elevenlabs_agent_id):
        raise HTTPException(status_code=503, detail="voice channel not configured")
    with api_pool().connection() as conn:
        customer = conn.execute("select name, email from customers where email = %s",
                                (email.lower(),)).fetchone()
    if not customer:
        raise HTTPException(status_code=404, detail="not a customer of the demo store")
    res = httpx.get(f"{ELEVEN}/v1/convai/conversation/token",
                    params={"agent_id": cfg.elevenlabs_agent_id},
                    headers={"xi-api-key": cfg.elevenlabs_api_key}, timeout=10)
    if res.status_code != 200:
        log.warning("elevenlabs token: %s %s", res.status_code, res.text[:200])
        raise HTTPException(status_code=502, detail="voice provider unavailable")
    return {
        "conversation_token": res.json()["token"],
        "dynamic_variables": {"caller": sign_caller(customer["email"]),
                              "customer_name": customer["name"].split(" ")[0]},
    }


# --- post-call webhook --------------------------------------------------------------------

def verify_webhook(raw: bytes, header: str, secret: str, now: float | None = None) -> None:
    """ElevenLabs signs `<timestamp>.<body>` with HMAC-SHA256: `t=<ts>,v0=<hex>`."""
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    ts, sig = parts.get("t", ""), parts.get("v0", "")
    if not ts.isdigit() or abs((time.time() if now is None else now) - int(ts)) > WEBHOOK_TOLERANCE_S:
        raise HTTPException(status_code=401, detail="stale or missing timestamp")
    good = hmac.new(secret.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, good):
        raise HTTPException(status_code=401, detail="invalid signature")


@webhook.post("/webhook")
async def post_call(request: Request, elevenlabs_signature: str = Header(default="")) -> dict:
    secret = settings().elevenlabs_webhook_secret or ""
    if not secret:
        raise HTTPException(status_code=503, detail="voice webhook not configured")
    raw = await request.body()
    verify_webhook(raw, elevenlabs_signature, secret)
    event = json.loads(raw)
    if event.get("type") != "post_call_transcription":
        return {"ok": True, "ignored": event.get("type")}
    data = event.get("data", {})
    conv = data.get("conversation_id", "")
    analysis = data.get("analysis") or {}
    meta = data.get("metadata") or {}
    transcript = [{"role": t.get("role"), "message": t.get("message")}
                  for t in data.get("transcript") or [] if t.get("message")]
    client_data = data.get("conversation_initiation_client_data") or {}
    caller = (client_data.get("dynamic_variables") or {}).get("caller")
    try:
        # A long call may outlive the caller's validity; the signature still identifies it.
        email = verify_caller(caller, allow_expired=True) if caller else None
    except HTTPException:
        email = None
    detail = {"duration_s": meta.get("call_duration_secs"), "successful": analysis.get("call_successful"),
              "summary": analysis.get("transcript_summary"), "turns": len(transcript), "customer": email}
    with api_pool().connection() as conn:
        conn.execute("insert into audit_log (actor, action, subject, detail) values (%s, %s, %s, %s)",
                     ("voice:elevenlabs", "voice_call", conv, Jsonb(detail)))
    t = tracer()
    t.trace(f"voice-{conv}", name="voice-call", tags=["voice"],
            input={"customer": email}, output={"summary": detail["summary"], "transcript": transcript},
            metadata={"conversation_id": conv, "duration_s": detail["duration_s"]})
    if detail["successful"] in ("success", "failure"):
        t.score(f"voice-{conv}", "call_successful", 1.0 if detail["successful"] == "success" else 0.0)
    t.flush()
    return {"ok": True}


def include(app, require_token) -> None:
    app.include_router(tools)  # ElevenLabs, with the voice tool secret
    app.include_router(session, dependencies=[Depends(require_token)])  # the dashboard's server
    app.include_router(webhook)  # ElevenLabs, HMAC-signed
