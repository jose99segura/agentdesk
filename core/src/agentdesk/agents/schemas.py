"""The structured outputs agents must produce. Anything else is rejected."""

from typing import Literal

from pydantic import BaseModel, Field

Intent = Literal["order_status", "return_request", "refund_request", "damaged_item",
                 "product_question", "cancellation", "other"]


class Triage(BaseModel):
    intent: Intent
    language: Literal["en", "es", "fr"]
    urgency: Literal["low", "normal", "high"]
    summary: str = Field(max_length=300)


class ProposedRefund(BaseModel):
    order_id: str
    amount_cents: int = Field(gt=0)
    reason: str = Field(min_length=3, max_length=200)


class Resolution(BaseModel):
    reply: str = Field(min_length=20)
    refund: ProposedRefund | None = None
    needs_human: bool = False
    summary: str = Field(max_length=300)


def tool_schema(model: type[BaseModel]) -> dict:
    """A JSON schema providers accept as tool parameters (no $defs indirection)."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def inline(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return inline(defs[node["$ref"].split("/")[-1]])
            return {k: inline(v) for k, v in node.items() if k != "title"}
        if isinstance(node, list):
            return [inline(v) for v in node]
        return node

    return inline(schema)
