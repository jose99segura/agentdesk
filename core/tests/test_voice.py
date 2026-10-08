"""The voice channel's trust boundaries: who is calling, who may call the tools, who signed the webhook."""

import hashlib
import hmac
import json
import time

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from agentdesk import api, config, voice

SECRET = "voice-tool-secret"
BRUNO = "eval.bruno@example.com"


@pytest.fixture
def c(monkeypatch):
    config.settings.cache_clear()
    monkeypatch.setenv("VOICE_TOOL_SECRET", SECRET)
    monkeypatch.setenv("ELEVENLABS_WEBHOOK_SECRET", "hook-secret")
    yield TestClient(api.app)
    config.settings.cache_clear()


def test_caller_round_trips_and_cannot_be_forged(c):
    caller = voice.sign_caller(BRUNO)
    assert voice.verify_caller(caller) == BRUNO
    who, expiry, mac = caller.split(".")
    other = voice.sign_caller("eval.alice@example.com").split(".")[0]
    for forged in (f"{other}.{expiry}.{mac}", f"{who}.{int(expiry) + 999}.{mac}", "unverified", ""):
        with pytest.raises(HTTPException):
            voice.verify_caller(forged)


def test_caller_expires(c):
    caller = voice.sign_caller(BRUNO, now=time.time() - voice.CALLER_TTL_S - 1)
    with pytest.raises(HTTPException):
        voice.verify_caller(caller)
    assert voice.verify_caller(caller, allow_expired=True) == BRUNO


STATUS = "/voice/tools/order_status"


def status(c, caller, order_id=None, secret=SECRET):
    body = {"caller": caller, "conversation_id": "", "order_id": order_id}
    return c.post(STATUS, json=body, headers={"X-Agentdesk-Voice": secret} if secret else {})


def test_tools_need_the_secret_and_a_signed_caller(c):
    caller = voice.sign_caller(BRUNO)
    assert status(c, caller, secret=None).status_code == 401
    assert status(c, caller, secret="wrong").status_code == 401
    assert status(c, "unverified").status_code == 403


def test_order_status_only_sees_the_callers_orders(c):
    mine = status(c, voice.sign_caller(BRUNO)).json()
    assert mine["orders"]
    own_id = mine["orders"][0]["id"]
    assert status(c, voice.sign_caller(BRUNO), own_id).json()["order"]["id"] == own_id
    assert status(c, voice.sign_caller("eval.alice@example.com"), own_id).json()["order"] is None


def sign(raw: bytes, ts: int, secret: str = "hook-secret") -> str:
    return f"t={ts},v0=" + hmac.new(secret.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()


def test_webhook_signature(c):
    raw = json.dumps({"type": "something_else"}).encode()
    now = int(time.time())
    ok = c.post("/voice/webhook", content=raw, headers={"elevenlabs-signature": sign(raw, now)})
    assert ok.status_code == 200 and ok.json()["ignored"] == "something_else"
    for bad in (sign(raw, now, "wrong"), sign(raw, now - 7200), "", "t=abc,v0=00"):
        assert c.post("/voice/webhook", content=raw, headers={"elevenlabs-signature": bad}).status_code == 401
