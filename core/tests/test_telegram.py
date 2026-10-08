"""Telegram service against the local database with a fake bot; every test rolls back."""

import json

import psycopg
import pytest
from psycopg.rows import dict_row

from agentdesk.config import settings
from agentdesk.telegram import TelegramService


class FakeBot:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        self.next_id = 100

    def call(self, method, **params):
        self.calls.append((method, params))
        self.next_id += 1
        return {"message_id": self.next_id}

    def sent(self):
        return [p for m, p in self.calls if m == "sendMessage"]


@pytest.fixture
def conn():
    try:
        c = psycopg.connect(settings().database_url_api, autocommit=True, row_factory=dict_row,
                            connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local database not running")
    with c.transaction(force_rollback=True):
        yield c
    c.close()


def make_proposal(conn, kind="send_reply"):
    """A ticket with one pending proposal, created the way the pipeline would."""
    order = conn.execute(
        """select o.id, o.total_cents, c.email from orders o join customers c on c.id = o.customer_id
           where o.status = 'delivered' and not exists (select 1 from refunds r where r.order_id = o.id)
           limit 1"""
    ).fetchone()
    ticket = conn.execute(
        """insert into tickets (external_id, channel, customer_email, body, status)
           values (gen_random_uuid()::text, 'email', %s, 'It arrived broken', 'awaiting_approval')
           returning id""",
        (order["email"],),
    ).fetchone()
    # Runs belong to the agent role; the API role may not create them, so borrow one.
    run = conn.execute("select id from runs limit 1").fetchone()
    if run is None:
        pytest.skip("needs at least one run in the local database (start the simulator once)")
    refund = {"order_id": order["id"], "amount_cents": order["total_cents"], "reason": "damaged"}
    payload = json.dumps({"body": "Hi, sorry about that."} if kind == "send_reply" else refund)
    return conn.execute(
        """insert into proposals (ticket_id, run_id, kind, tier, payload)
           values (%s, %s, %s, %s, %s::jsonb) returning id""",
        (ticket["id"], run["id"], kind, 3 if kind == "refund" else 2, payload),
    ).fetchone()["id"]


def service(bot, cards_per_hour=20, interactive=True):
    return TelegramService(bot, "42", cards_per_hour, "http://localhost:3020", interactive)


def test_pending_proposal_becomes_one_card_with_buttons(conn):
    conn.execute("update proposals set notified_at = now() where notified_at is null")
    pid = make_proposal(conn)
    bot = FakeBot()
    svc = service(bot)
    svc.announce(conn)
    svc.announce(conn)  # second pass: already notified, nothing new
    cards = bot.sent()
    assert len(cards) == 1
    assert cards[0]["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == f"a:{pid}"


def test_spent_budget_folds_proposals_into_a_digest(conn):
    conn.execute("update proposals set notified_at = now() where notified_at is null")
    for _ in range(3):
        make_proposal(conn)
    bot = FakeBot()
    service(bot, cards_per_hour=0).announce(conn)
    sent = bot.sent()
    assert len(sent) == 1 and "3 more proposals" in sent[0]["text"]


def test_callback_from_another_chat_is_refused(conn):
    pid = make_proposal(conn)
    bot = FakeBot()
    service(bot).handle_callback(conn, {
        "id": "cb", "data": f"a:{pid}", "from": {"id": 7},
        "message": {"message_id": 1, "chat": {"id": 999}, "text": "card"},
    })
    status = conn.execute("select status from proposals where id = %s", (pid,)).fetchone()["status"]
    assert status == "pending"


def test_approve_from_the_right_chat_executes_the_refund(conn):
    pid = make_proposal(conn, kind="refund")
    bot = FakeBot()
    service(bot).handle_callback(conn, {
        "id": "cb", "data": f"a:{pid}", "from": {"username": "jose"},
        "message": {"message_id": 1, "chat": {"id": 42}, "text": "card"},
    })
    row = conn.execute("select status, decided_by from proposals where id = %s", (pid,)).fetchone()
    assert row == {"status": "executed", "decided_by": "telegram:jose"}
    assert conn.execute("select count(*) as n from refunds where proposal_id = %s",
                        (pid,)).fetchone()["n"] == 1


def test_repeated_alert_is_sent_once_and_counts_suppressions(conn):
    bot = FakeBot()
    svc = service(bot)
    for _ in range(3):
        svc.alert(conn, "test:alert", "boom")
    assert len(bot.sent()) == 1
    row = conn.execute("select suppressed from alerts where key = 'test:alert'").fetchone()
    assert row["suppressed"] == 2


def test_send_only_mode_has_no_buttons_and_links_the_dashboard(conn):
    conn.execute("update proposals set notified_at = now() where notified_at is null")
    make_proposal(conn)
    bot = FakeBot()
    service(bot, interactive=False).announce(conn)
    card = bot.sent()[0]
    assert "reply_markup" not in card and "localhost:3020" in card["text"]
