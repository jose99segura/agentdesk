"""What the platform runs with, read from the code itself, for the dashboard's /info page.

Nothing here is secret: prompts, tool schemas and retry settings. Serving them from the
running code means the explanation can never drift from what the agents actually get.
"""

import inspect
from dataclasses import fields

import yaml

from .agents.runner import (
    MAX_ROUNDS,
    RESOLVER_SYSTEM,
    SUBMIT_RESOLUTION,
    SUBMIT_TRIAGE,
    TRIAGE_SYSTEM,
    _ticket_text,
)
from .agents.schemas import Triage
from .config import settings
from .evals.judge import RUBRIC
from .evals.runner import SUITE
from .gateway import TOOLS
from .guards import COMMITMENT_RE, INJECTION_RE, MAX_REPLY_CHARS
from .jobs import BASE_DELAY_S, LEASE_SECONDS, MAX_ATTEMPTS
from .llm import build_providers
from .llm.pricing import PRICES
from .llm.router import CircuitBreaker, ModelRouter


def _spec(s) -> dict:
    return {"name": s.name, "description": s.description, "parameters": s.parameters}


EXAMPLE_TICKET = {
    "customer_email": "lucia.garcia1@example.com",
    "channel": "email",
    "subject": "Order ORD-10020",
    "body": "My order ORD-10020 arrived broken. The lamp is cracked. Not happy!!",
}
EXAMPLE_TRIAGE = Triage(intent="damaged_item", language="en", urgency="high", summary="")


def describe() -> dict:
    cfg = settings()
    breaker = {f.name: f.default for f in fields(CircuitBreaker)
               if f.name in ("failure_threshold", "cooldown_s")}
    attempts = inspect.signature(ModelRouter).parameters["attempts_per_provider"].default
    return {
        "agents": {
            "triage": {
                "system_prompt": TRIAGE_SYSTEM,
                "example_user_message": _ticket_text(EXAMPLE_TICKET),
                "output_tool": _spec(SUBMIT_TRIAGE),
                "tools": [],
                "forced": True,
            },
            "resolver": {
                "system_prompt": RESOLVER_SYSTEM,
                "example_user_message": _ticket_text(EXAMPLE_TICKET, EXAMPLE_TRIAGE),
                "output_tool": _spec(SUBMIT_RESOLUTION),
                "tools": [_spec(t.spec) for t in TOOLS.values()],
                "max_rounds": MAX_ROUNDS,
            },
        },
        "models": {
            "chain": [p.name for p in build_providers(cfg)],
            "configured_chain": cfg.model_chain.split(","),
            "mistral_model": cfg.mistral_model,
            "anthropic_model": cfg.anthropic_model,
            "prices_usd_per_million_tokens": PRICES,
            "attempts_per_provider": attempts,
            "breaker": breaker,
        },
        "queue": {
            "max_attempts": MAX_ATTEMPTS,
            "backoff_seconds": [BASE_DELAY_S * 2 ** (n - 1) for n in range(1, MAX_ATTEMPTS)],
            "lease_seconds": LEASE_SECONDS,
        },
        "guards": {
            "blocks": ["invented_order", "foreign_email", "refund_wrong_customer",
                       "refund_exceeds_order", "refund_not_refundable"],
            "flags": ["commitment_language", "long_reply", "possible_prompt_injection",
                      "agent_requested_human"],
            "commitment_pattern": COMMITMENT_RE.pattern,
            "injection_pattern": INJECTION_RE.pattern,
            "max_reply_chars": MAX_REPLY_CHARS,
        },
        "evals": _evals(),
        "telegram": {
            "cards_per_hour": cfg.telegram_cards_per_hour,
            "alert_cooldown_minutes": 30,
        },
    }


def _evals() -> dict:
    suite = yaml.safe_load(SUITE.read_text(encoding="utf-8"))
    return {
        "gate": suite["gate"],
        "judge_rubric": RUBRIC,
        "cases": [{k: c[k] for k in ("id", "category", "description", "from", "body", "expect")}
                  for c in suite["cases"]],
    }
