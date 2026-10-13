"""Demo mode: a store visitor may review only their own store tickets, and can reset the demo."""

import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg.rows import dict_row

from agentdesk import api, config

H = {"Authorization": "Bearer dev-token"}


@pytest.fixture(scope="module")
def c():
    config.settings.cache_clear()
    try:
        psycopg.connect(config.settings().database_url_api, connect_timeout=2).close()
    except psycopg.OperationalError:
        pytest.skip("local database not running")
    return TestClient(api.app)


def proposal_on(external_id: str, email: str) -> str:
    """A pending reply proposal on a fresh ticket, written as the agent role would."""
    cfg = config.settings()
    with psycopg.connect(cfg.database_url_api, autocommit=True, row_factory=dict_row) as api_conn:
        ticket = api_conn.execute(
            "insert into tickets (external_id, channel, customer_email, body, status) "
            "values (%s, 'chat', %s, 'test', 'awaiting_approval') returning id",
            (external_id, email),
        ).fetchone()["id"]
    with psycopg.connect(cfg.database_url_agent, autocommit=True, row_factory=dict_row) as agent:
        run = agent.execute("insert into runs (ticket_id, agent_id) values (%s, 'resolver') returning id",
                            (ticket,)).fetchone()["id"]
        return str(agent.execute(
            "insert into proposals (ticket_id, run_id, kind, tier, payload) "
            "values (%s, %s, 'send_reply', 2, '{\"body\": \"hello\"}') returning id",
            (ticket, run),
        ).fetchone()["id"])


def decide(c, pid, email, approve=True):
    return c.post(f"/shop/proposals/{pid}/decision", json={"email": email, "approve": approve}, headers=H)


def test_visitor_decides_their_own_store_ticket(c):
    pid = proposal_on(f"shop-{uuid.uuid4()}", "eval.bruno@example.com")
    assert decide(c, pid, "eval.alice@example.com").status_code == 404  # someone else's
    res = decide(c, pid, "eval.bruno@example.com")
    assert res.status_code == 200 and res.json()["status"] == "executed"
    assert decide(c, pid, "eval.bruno@example.com").json()["already_decided"] is True


def test_visitor_cannot_review_tickets_from_other_channels(c):
    pid = proposal_on(f"email-{uuid.uuid4()}", "eval.bruno@example.com")
    assert decide(c, pid, "eval.bruno@example.com").status_code == 404


def test_decision_needs_the_api_token(c):
    pid = proposal_on(f"shop-{uuid.uuid4()}", "eval.chloe@example.com")
    body = {"email": "eval.chloe@example.com", "approve": False}
    assert c.post(f"/shop/proposals/{pid}/decision", json=body).status_code == 401


def test_reset_restores_the_demo_orders(c):
    res = c.post("/shop/reset", headers=H)
    assert res.status_code == 200 and "refunds_removed" in res.json()
    orders = c.get("/shop/customers/eval.chloe@example.com", headers=H).json()["orders"]
    # The seed's own gesture on ORD-90005 stays.
    assert next(o for o in orders if o["id"] == "ORD-90005")["refunded_cents"] == 1000
