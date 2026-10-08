"""Writes every agent run and every step as it happens.

Runs and steps are committed one by one on their own autocommit connection, so the
dashboard sees a run live and a failed run keeps its full history. What the run
*changes* (ticket fields, proposals) is committed separately and atomically by the
pipeline, so a crash halfway leaves a complete log and no half-applied effects.
Each step is mirrored to Langfuse when it is configured.
"""

import time
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

from .llm.pricing import cost_usd
from .llm.types import Completion
from .tracing import now_iso, tracer


class RunRecorder:
    def __init__(self, conn: Connection, *, agent_id: str, ticket_id: str, job_id: int | None,
                 trace_id: str):
        self.conn = conn
        self.agent_id = agent_id
        self.trace_id = trace_id
        self.seq = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.cost = 0.0
        self.provider: str | None = None
        self.model: str | None = None
        self.started = time.monotonic()
        t = tracer()
        row = conn.execute(
            """insert into runs (ticket_id, job_id, agent_id, trace_id, trace_url)
               values (%s, %s, %s, %s, %s) returning id""",
            (ticket_id, job_id, agent_id, trace_id, t.trace_url(trace_id)),
        ).fetchone()
        self.run_id = str(row["id"])

    def step(self, kind: str, name: str, status: str, *, input: Any = None, output: Any = None,
             latency_ms: int | None = None) -> None:
        self.seq += 1
        self.conn.execute(
            """insert into run_steps (run_id, seq, kind, name, status, input, output, latency_ms)
               values (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (self.run_id, self.seq, kind, name, status,
             Jsonb(input) if input is not None else None,
             Jsonb(output) if output is not None else None, latency_ms),
        )
        if kind != "llm":
            tracer().span(
                self.trace_id,
                name=f"{self.agent_id}:{kind}:{name}",
                startTime=now_iso(),
                endTime=now_iso(),
                input=input,
                output=output,
                level="ERROR" if status == "error" else ("WARNING" if status == "blocked" else "DEFAULT"),
                metadata={"run_id": self.run_id, "kind": kind},
            )

    def llm(self, completion: Completion, messages: list[dict], output: Any) -> None:
        cost = cost_usd(completion.model, completion.input_tokens, completion.output_tokens)
        self.input_tokens += completion.input_tokens
        self.output_tokens += completion.output_tokens
        self.cost += cost
        self.provider, self.model = completion.provider, completion.model
        self.step("llm", f"{completion.provider}/{completion.model}", "ok",
                  output={"tokens_in": completion.input_tokens,
                          "tokens_out": completion.output_tokens,
                          "cost_usd": round(cost, 6), "response": output},
                  latency_ms=completion.latency_ms)
        tracer().generation(
            self.trace_id,
            name=f"{self.agent_id}:llm",
            startTime=now_iso(),
            endTime=now_iso(),
            model=completion.model,
            input=messages,
            output=output,
            usageDetails={"input": completion.input_tokens, "output": completion.output_tokens},
            costDetails={"total": cost},
            metadata={"provider": completion.provider, "run_id": self.run_id,
                      "latency_ms": completion.latency_ms},
        )

    def finish(self, status: str, error: str | None = None, error_kind: str | None = None) -> None:
        self.conn.execute(
            """update runs set status = %s, provider = %s, model = %s, input_tokens = %s,
                 output_tokens = %s, cost_usd = %s, latency_ms = %s, error = %s,
                 error_kind = %s, ended_at = now()
               where id = %s""",
            (status, self.provider, self.model, self.input_tokens, self.output_tokens,
             self.cost, int((time.monotonic() - self.started) * 1000), error, error_kind,
             self.run_id),
        )
