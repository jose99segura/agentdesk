"""The production-only entry points: Telegram's webhook and the worker's HTTP mode."""

from fastapi.testclient import TestClient

from agentdesk import api, config


def client(monkeypatch, secret):
    config.settings.cache_clear()
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", secret or "")
    return TestClient(api.app)


def test_webhook_refuses_a_missing_or_wrong_secret(monkeypatch):
    c = client(monkeypatch, "right-secret")
    assert c.post("/telegram/webhook", json={}).status_code == 401
    assert c.post("/telegram/webhook", json={},
                  headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"}).status_code == 401


def test_webhook_is_closed_when_no_secret_is_configured(monkeypatch):
    c = client(monkeypatch, "")
    assert c.post("/telegram/webhook", json={},
                  headers={"X-Telegram-Bot-Api-Secret-Token": ""}).status_code == 401


def test_webhook_accepts_the_right_secret(monkeypatch):
    c = client(monkeypatch, "right-secret")
    res = c.post("/telegram/webhook", json={"update_id": 1},
                 headers={"X-Telegram-Bot-Api-Secret-Token": "right-secret"})
    assert res.status_code == 200
    config.settings.cache_clear()


def test_pubsub_is_a_no_op_without_a_topic(monkeypatch):
    from agentdesk.pubsub import wake_workers

    config.settings.cache_clear()
    monkeypatch.delenv("PUBSUB_TOPIC", raising=False)
    wake_workers("anything")  # must not try to reach the metadata server
    config.settings.cache_clear()
