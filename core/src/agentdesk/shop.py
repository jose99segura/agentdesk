"""Read endpoints for the demo storefront (/shop on the dashboard).

The storefront plays the customer's side: pick a demo customer, see their orders, write to
support, and watch the ticket until the human-approved reply arrives. These routes only
read, run on the `desk_api` role, and sit behind the API token: the dashboard calls them
from its server, never from the browser. Everything they return is the demo store.
"""

from fastapi import APIRouter, Depends, HTTPException

from .db import api_pool

router = APIRouter(prefix="/shop")

# Customers the storefront offers to "log in" as: the evaluation fixtures have orders in
# every state, so every path of the agents can be tried from the shop.
FEATURED = ["eval.bruno@example.com", "eval.alice@example.com", "eval.chloe@example.com"]


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
    return {"products": products, "customers": customers}


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


@router.get("/tickets/{ticket_id}")
def ticket(ticket_id: str, email: str) -> dict:
    """A ticket as its sender sees it: progress, and the reply once a person approved it."""
    with api_pool().connection() as conn:
        t = conn.execute(
            """select id, status::text, intent, created_at from tickets
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
            "select kind, status::text, payload from proposals where ticket_id = %s order by created_at",
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
    }


def include(app, require_token) -> None:
    app.include_router(router, dependencies=[Depends(require_token)])
