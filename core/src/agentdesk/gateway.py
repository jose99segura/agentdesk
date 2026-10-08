"""The only way an agent touches data: a gateway that hands it exactly its granted tools.

Three layers, from weakest to strongest:
1. The model is only *offered* the tools in its registry row.
2. A call to anything else is refused here and logged as a blocked step.
3. The tools run on the `desk_agent` database role, which has no grant to refund,
   change an order or send a message. Even a bug in this file cannot do those.

Tools are also bound to the ticket: the customer is always the ticket's sender, never
an argument the model chooses, so an agent cannot look up somebody else's orders.
"""

import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from psycopg import Connection
from pydantic import BaseModel, ValidationError

from .llm.types import ToolCall, ToolSpec
from .recorder import RunRecorder


class NoArgs(BaseModel):
    pass


class OrderArgs(BaseModel):
    order_id: str


@dataclass
class Tool:
    spec: ToolSpec
    args: type[BaseModel]
    fn: Callable[[Connection, str, Any], dict]


def _get_customer(conn: Connection, email: str, _: NoArgs) -> dict:
    row = conn.execute(
        "select name, email, language, created_at::date::text as since from customers where email = %s",
        (email,),
    ).fetchone()
    return {"customer": row} if row else {"customer": None, "note": "sender is not a known customer"}


def _list_orders(conn: Connection, email: str, _: NoArgs) -> dict:
    rows = conn.execute(
        """select o.id, o.status::text, o.total_cents, o.created_at::date::text as created
           from orders o join customers c on c.id = o.customer_id
           where c.email = %s order by o.created_at desc limit 10""",
        (email,),
    ).fetchall()
    return {"orders": rows}


def _get_order(conn: Connection, email: str, args: OrderArgs) -> dict:
    order = conn.execute(
        """select o.id, o.status::text, o.total_cents, o.carrier, o.tracking,
                  o.created_at::date::text as created, o.shipped_at::date::text as shipped,
                  o.delivered_at::date::text as delivered,
                  coalesce((select sum(amount_cents) from refunds r where r.order_id = o.id), 0)
                    as refunded_cents
           from orders o join customers c on c.id = o.customer_id
           where o.id = %s and c.email = %s""",
        (args.order_id.strip().upper(), email),
    ).fetchone()
    if not order:
        return {"order": None, "note": "no order with that id on this customer's account"}
    order["items"] = conn.execute(
        """select p.name, i.quantity, i.price_cents from order_items i
           join products p on p.id = i.product_id where i.order_id = %s""",
        (order["id"],),
    ).fetchall()
    return {"order": order}


TOOLS: dict[str, Tool] = {
    "get_customer": Tool(
        ToolSpec("get_customer", "The customer who sent this ticket.",
                 {"type": "object", "properties": {}}),
        NoArgs, _get_customer),
    "list_orders": Tool(
        ToolSpec("list_orders", "The sender's ten most recent orders.",
                 {"type": "object", "properties": {}}),
        NoArgs, _list_orders),
    "get_order": Tool(
        ToolSpec("get_order", "One of the sender's orders with items, tracking and refunds so far.",
                 {"type": "object", "properties": {"order_id": {"type": "string"}},
                  "required": ["order_id"]}),
        OrderArgs, _get_order),
}


class Gateway:
    def __init__(self, conn: Connection, granted: list[str], customer_email: str,
                 recorder: RunRecorder):
        unknown = set(granted) - TOOLS.keys()
        if unknown:
            raise ValueError(f"registry grants unknown tools: {sorted(unknown)}")
        self.conn = conn
        self.granted = granted
        self.email = customer_email
        self.recorder = recorder
        # Every result this run has seen, for the guards to check the reply against.
        self.seen: dict[str, list[dict]] = {}

    def specs(self) -> list[ToolSpec]:
        return [TOOLS[name].spec for name in self.granted]

    def call(self, call: ToolCall) -> str:
        started = time.monotonic()
        if call.name not in self.granted:
            self.recorder.step("tool", call.name, "blocked", input=call.arguments,
                               output={"error": "tool not granted to this agent"})
            return json.dumps({"error": f"tool '{call.name}' is not available"})
        tool = TOOLS[call.name]
        try:
            args = tool.args.model_validate(call.arguments or {})
        except ValidationError as exc:
            self.recorder.step("tool", call.name, "error", input=call.arguments,
                               output={"error": exc.errors(include_url=False)})
            return json.dumps({"error": "invalid arguments", "detail": str(exc)})
        result = tool.fn(self.conn, self.email, args)
        self.seen.setdefault(call.name, []).append(result)
        self.recorder.step("tool", call.name, "ok", input=call.arguments, output=result,
                           latency_ms=int((time.monotonic() - started) * 1000))
        return json.dumps(result, default=str)

    def known_orders(self) -> dict[str, dict]:
        """Orders this run actually looked up, by id."""
        orders: dict[str, dict] = {}
        for result in self.seen.get("list_orders", []):
            for o in result.get("orders", []):
                orders[o["id"]] = o
        for result in self.seen.get("get_order", []):
            if result.get("order"):
                orders[result["order"]["id"]] = result["order"]
        return orders
