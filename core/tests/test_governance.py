"""The dangerous writes must be impossible for the agent role, not merely discouraged.

These run against the local Supabase database (`supabase start`) and are skipped when
it is not reachable.
"""

import psycopg
import pytest
from psycopg.rows import dict_row

from agentdesk.agents.schemas import ProposedRefund, Resolution
from agentdesk.config import settings
from agentdesk.guards import check_resolution


@pytest.fixture(scope="module")
def agent_conn():
    try:
        conn = psycopg.connect(settings().database_url_agent, autocommit=True, row_factory=dict_row,
                               connect_timeout=2)
    except psycopg.OperationalError:
        pytest.skip("local database not running")
    yield conn
    conn.close()


@pytest.fixture(scope="module")
def order(agent_conn):
    return agent_conn.execute(
        """select o.id, o.total_cents, c.email from orders o join customers c on c.id = o.customer_id
           where o.status = 'delivered'
             and not exists (select 1 from refunds r where r.order_id = o.id)
           limit 1"""
    ).fetchone()


@pytest.mark.parametrize("sql", [
    "insert into refunds (order_id, amount_cents, reason, proposal_id, approved_by) "
    "values ('ORD-10001', 100, 'x', gen_random_uuid(), 'agent')",
    "update orders set status = 'returned' where id = 'ORD-10001'",
    "insert into outbound_messages (ticket_id, proposal_id, channel, recipient, body) "
    "values (gen_random_uuid(), gen_random_uuid(), 'email', 'a@b.c', 'hi')",
    "update proposals set status = 'approved'",
    "delete from audit_log",
])
def test_agent_role_cannot_perform_forbidden_writes(agent_conn, sql):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        agent_conn.execute(sql)


def resolution(reply, refund=None):
    return Resolution(reply=reply, refund=refund, summary="t")


def test_invented_order_is_blocked(agent_conn, order):
    r = resolution(f"Hi, your order ORD-99999 is on its way. {'x' * 10}")
    assert "invented_order" in check_resolution(agent_conn, order["email"], r, {}).blocked


def test_refund_above_order_total_is_blocked(agent_conn, order):
    refund = ProposedRefund(order_id=order["id"], amount_cents=order["total_cents"] + 1, reason="damaged")
    r = resolution("We are refunding your order, sorry about that.", refund)
    known = {order["id"]: order}
    assert "refund_exceeds_order" in check_resolution(agent_conn, order["email"], r, known).blocked


def test_refund_on_someone_elses_order_is_blocked(agent_conn, order):
    refund = ProposedRefund(order_id=order["id"], amount_cents=100, reason="damaged")
    r = resolution("We are refunding your order, sorry about that.", refund)
    result = check_resolution(agent_conn, "somebody.else@example.com", r, {})
    assert "refund_wrong_customer" in result.blocked


def test_valid_refund_passes_and_promises_are_flagged(agent_conn, order):
    refund = ProposedRefund(order_id=order["id"], amount_cents=order["total_cents"], reason="damaged")
    r = resolution(f"Refund requested for {order['id']}. It will arrive tomorrow, guaranteed.", refund)
    result = check_resolution(agent_conn, order["email"], r, {order["id"]: order})
    assert result.blocked == []
    assert "commitment_language" in result.flags


def test_commitments_ignore_negations():
    from agentdesk.guards import has_commitment

    assert has_commitment("Your parcel will arrive tomorrow, guaranteed.")
    assert has_commitment("Le colis arrivera demain.")
    assert not has_commitment("Unfortunately, we cannot guarantee a specific delivery date.")
    assert not has_commitment("We can't guarantee it will arrive by Friday.")


def test_negation_with_a_typographic_apostrophe():
    from agentdesk.guards import has_commitment

    assert not has_commitment("While we can’t guarantee a specific delivery date, you can track it.")
