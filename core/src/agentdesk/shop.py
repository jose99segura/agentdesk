"""Read endpoints for the demo storefront (/shop on the dashboard).

The storefront plays the customer's side: pick a demo customer, see their orders, write to
support, and watch the ticket until the human-approved reply arrives. These routes only
read, run on the `desk_api` role, and sit behind the API token: the dashboard calls them
from its server, never from the browser. Everything they return is the demo store.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .config import settings
from .db import api_pool

router = APIRouter(prefix="/shop")

# Customers the storefront offers to "log in" as: the evaluation fixtures have orders in
# every state, so every path of the agents can be tried from the shop.
FEATURED = ["eval.bruno@example.com", "eval.alice@example.com", "eval.chloe@example.com"]
# Tickets the store itself created (chat directly or through n8n, phone calls): the only
# ones a visitor may review in demo mode.
STORE_PREFIXES = ("shop-", "n8n-", "voice-")


def _customer(conn, email: str) -> dict:
    row = conn.execute(
        "select id, name, email, language from customers where email = %s", (email.lower(),)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="not a customer of the demo store")
    return row


@router.get("/catalog")
def catalog() -> dict:
    with api_pool().connection() as conn:
        products = conn.execute(
            "select sku, name, price_cents from products order by price_cents desc"
        ).fetchall()
        customers = conn.execute(
            """select c.name, c.email, c.language, count(o.id) as orders
               from customers c left join orders o on o.customer_id = c.id
               where c.email = any(%s) group by c.id order by array_position(%s, c.email)""",
            (FEATURED, FEATURED),
        ).fetchall()
    cfg = settings()
    return {"products": products, "customers": customers,
            "voice": bool(cfg.elevenlabs_api_key and cfg.elevenlabs_agent_id and cfg.voice_tool_secret)}


@router.get("/customers/{email}")
def customer(email: str) -> dict:
    with api_pool().connection() as conn:
        c = _customer(conn, email)
        orders = conn.execute(
            """select o.id, o.status::text, o.total_cents, o.carrier, o.tracking,
                      o.created_at::date::text as created, o.delivered_at::date::text as delivered,
                      coalesce((select sum(amount_cents) from refunds r where r.order_id = o.id), 0)
                        as refunded_cents,
                      coalesce((select json_agg(json_build_object('name', p.name, 'quantity', i.quantity))
                                from order_items i join products p on p.id = i.product_id
                                where i.order_id = o.id), '[]') as items
               from orders o where o.customer_id = %s order by o.created_at desc""",
            (c["id"],),
        ).fetchall()
    return {"customer": {k: c[k] for k in ("name", "email", "language")}, "orders": orders}


@router.get("/customers/{email}/tickets")
def recent_tickets(email: str, channel: str = "voice", minutes: int = 15) -> dict:
    """Tickets a customer opened lately on one channel: how the store finds a call's ticket."""
    with api_pool().connection() as conn:
        rows = conn.execute(
            """select id::text, created_at from tickets
               where customer_email = %s and channel = %s
                 and created_at > now() - make_interval(mins => %s)
               order by created_at desc limit 5""",
            (email.lower(), channel, max(1, min(minutes, 120))),
        ).fetchall()
    return {"tickets": [r["id"] for r in rows]}


@router.get("/tickets/{ticket_id}")
def ticket(ticket_id: str, email: str) -> dict:
    """A ticket as its sender sees it: progress, and the reply once a person approved it."""
    with api_pool().connection() as conn:
        t = conn.execute(
            """select id, external_id, status::text, intent, created_at from tickets
               where id = %s and customer_email = %s""",
            (ticket_id, email.lower()),
        ).fetchone()
        if not t:
            raise HTTPException(status_code=404, detail="no such ticket for this customer")
        job = conn.execute(
            "select status::text, attempts from jobs where ticket_id = %s order by id desc limit 1",
            (ticket_id,),
        ).fetchone()
        steps = conn.execute(
            """select r.agent_id, s.kind, s.name from run_steps s join runs r on r.id = s.run_id
               where r.ticket_id = %s order by s.created_at""",
            (ticket_id,),
        ).fetchall()
        proposals = conn.execute(
            """select id::text, kind, status::text, payload, flags from proposals
               where ticket_id = %s order by created_at""",
            (ticket_id,),
        ).fetchall()
        sent = conn.execute(
            "select body, sent_at from outbound_messages where ticket_id = %s order by sent_at desc limit 1",
            (ticket_id,),
        ).fetchone()
    refund = next((p for p in proposals if p["kind"] == "refund"), None)
    return {
        "status": t["status"],
        "intent": t["intent"],
        "job": job,
        "looked_up": sorted({s["name"] for s in steps if s["kind"] == "tool"}),
        "agents": sorted({s["agent_id"] for s in steps}),
        "reply_status": next((p["status"] for p in proposals if p["kind"] == "send_reply"), None),
        "refund": {"status": refund["status"], "amount_cents": refund["payload"].get("amount_cents"),
                   "order_id": refund["payload"].get("order_id")} if refund else None,
        "reply": sent["body"] if sent else None,
        # What the reviewer sees, for demo mode: the store's visitor can play that person.
        "proposals": [{"id": p["id"], "kind": p["kind"], "status": p["status"], "flags": p["flags"],
                       "body": p["payload"].get("body"), "order_id": p["payload"].get("order_id"),
                       "amount_cents": p["payload"].get("amount_cents")} for p in proposals],
        "reviewable": settings().demo_reviewer and _is_store_ticket(t["external_id"], email),
    }


def _is_store_ticket(external_id: str, email: str) -> bool:
    return external_id.startswith(STORE_PREFIXES) and email.lower() in FEATURED


class DemoDecision(BaseModel):
    email: str
    approve: bool


@router.post("/proposals/{proposal_id}/decision")
def demo_decision(proposal_id: str, d: DemoDecision) -> dict:
    """Demo mode: the visitor decides as the store's reviewer, through the same approval
    path as Telegram and the dashboard (re-validated, audited). Only on store tickets of
    the demo customers, and only as the customer the store is signed in as."""
    from .approvals import DecisionError, decide

    if not settings().demo_reviewer:
        raise HTTPException(status_code=403, detail="demo reviewing is off")
    with api_pool().connection() as conn:
        row = conn.execute(
            """select t.external_id, t.customer_email from proposals p join tickets t on t.id = p.ticket_id
               where p.id = %s""",
            (proposal_id,),
        ).fetchone()
        own = row and row["customer_email"] == d.email.lower()
        if not own or not _is_store_ticket(row["external_id"], d.email):
            raise HTTPException(status_code=404, detail="no such proposal on this customer's store tickets")
        try:
            return decide(conn, proposal_id, d.approve, "demo-visitor")
        except DecisionError as exc:
            conn.execute(
                """update proposals set status = 'failed', decided_by = 'demo-visitor', decided_at = now()
                   where id = %s and status = 'pending'""",
                (proposal_id,),
            )
            raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/reset")
def reset() -> dict:
    """Put the demo customers' orders back as the seed left them (refunds undone)."""
    with api_pool().connection() as conn:
        return conn.execute("select reset_demo_store() as r").fetchone()["r"]


def include(app, require_token) -> None:
    app.include_router(router, dependencies=[Depends(require_token)])
