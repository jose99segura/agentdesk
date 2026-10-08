"""Run the golden suite through the real agents and decide whether the gate opens.

Each case runs triage, the resolver (with its gateway and granted tools) and the guards,
exactly as a live ticket would, but nothing is proposed or sent: evaluations only read
the store. Every case is a Langfuse trace with scores, every suite run is a Langfuse
dataset run, and results are stored in eval_runs / eval_results for the dashboard.
"""

import logging
import os
import subprocess
import time
import uuid
from pathlib import Path

import psycopg
import yaml
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ..agents.runner import load_agent, run_resolver, run_triage
from ..config import settings
from ..gateway import Gateway
from ..guards import check_resolution, ticket_flags
from ..llm import build_providers
from ..llm.router import ModelRouter
from ..recorder import RunRecorder
from ..tracing import tracer
from .assertions import Outcome, check
from .judge import judge

log = logging.getLogger("agentdesk.evals")
SUITE = Path(__file__).resolve().parents[3] / "evals" / "golden.yaml"
DATASET = "agentdesk-golden"


def _git_sha() -> str | None:
    if sha := os.environ.get("GITHUB_SHA"):
        return sha[:12]
    try:
        return subprocess.run(["git", "rev-parse", "--short=12", "HEAD"], capture_output=True,
                              text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _ticket(case: dict) -> dict:
    return {"id": None, "customer_email": case["from"], "channel": "email",
            "subject": None, "body": case["body"]}


def run_case(conn, router: ModelRouter, judge_router: ModelRouter | None, case: dict,
             eval_run_id: str, threshold: int) -> dict:
    ticket = _ticket(case)
    trace_id = uuid.uuid4().hex
    tracer().trace(trace_id, name=f"eval:{case['id']}", tags=["eval", case["category"]],
                   input={"from": case["from"], "body": case["body"]},
                   metadata={"eval_run_id": eval_run_id, "case": case["id"]})
    outcome = Outcome()
    recorders: list[RunRecorder] = []
    looked_up: dict = {}
    started = time.monotonic()
    try:
        load_agent(conn, "triage")
        rec_t = RunRecorder(conn, agent_id="triage", ticket_id=None, job_id=None,
                            trace_id=trace_id, eval_run_id=eval_run_id)
        recorders.append(rec_t)
        tri = run_triage(router, ticket, rec_t)
        rec_t.finish("succeeded")
        outcome.intent, outcome.language = tri.intent, tri.language

        resolver = load_agent(conn, "resolver")
        rec_r = RunRecorder(conn, agent_id="resolver", ticket_id=None, job_id=None,
                            trace_id=trace_id, eval_run_id=eval_run_id)
        recorders.append(rec_r)
        gateway = Gateway(conn, list(resolver["tools"]), ticket["customer_email"], rec_r)
        res = run_resolver(router, ticket, tri, gateway, rec_r)
        guard = check_resolution(conn, ticket["customer_email"], res, gateway.known_orders())
        flags = guard.flags + ticket_flags(ticket["body"])
        if res.needs_human:
            flags.append("agent_requested_human")
        rec_r.step("guard", "output checks", "blocked" if guard.blocked else "ok",
                   output={"blocked": guard.blocked, "flags": flags})
        rec_r.finish("succeeded")
        looked_up = gateway.seen
        outcome.reply = res.reply
        outcome.refund = res.refund.model_dump() if res.refund else None
        outcome.needs_human = res.needs_human
        outcome.blocked, outcome.flags = guard.blocked, flags
    except Exception as exc:  # a case that crashes is a failed case, not a failed suite
        outcome.error = f"{type(exc).__name__}: {exc}"
        for rec in recorders:
            rec.finish("failed", error=outcome.error[:1000], error_kind=type(exc).__name__)

    assertions = check(case.get("expect", {}), outcome)
    passed = all(ok for _, ok, _ in assertions)

    grade = None
    if judge_router and not outcome.error:
        try:
            g, model = judge(judge_router, recorders[-1], _ticket_text(ticket), looked_up,
                             outcome.reply, outcome.refund)
            grade = {**g.model_dump(), "overall": g.overall, "model": model,
                     "passed": g.overall >= threshold}
            passed = passed and grade["passed"]
        except Exception as exc:
            grade = {"error": f"{type(exc).__name__}: {exc}"}

    cost = sum(r.cost for r in recorders)
    latency = int((time.monotonic() - started) * 1000)
    t = tracer()
    t.score(trace_id, "eval.passed", 1 if passed else 0,
            comment="; ".join(f"{n}: {d}" for n, ok, d in assertions if not ok) or "all assertions held")
    if grade and "overall" in grade:
        t.score(trace_id, "judge.overall", grade["overall"], comment=grade["reasoning"])
    t.trace(trace_id, output={"passed": passed, "reply": outcome.reply, "refund": outcome.refund,
                              "blocked": outcome.blocked, "flags": outcome.flags})

    conn.execute(
        """insert into eval_results (eval_run_id, case_id, category, description, passed,
             assertions, judge, output, latency_ms, cost_usd, trace_url)
           values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (eval_run_id, case["id"], case["category"], case["description"], passed,
         Jsonb([{"name": n, "passed": ok, "detail": d} for n, ok, d in assertions]),
         Jsonb(grade) if grade else None,
         Jsonb({"intent": outcome.intent, "language": outcome.language, "reply": outcome.reply,
                "refund": outcome.refund, "needs_human": outcome.needs_human,
                "blocked": outcome.blocked, "flags": outcome.flags, "error": outcome.error}),
         latency, cost, t.trace_url(trace_id)),
    )
    return {"case": case, "passed": passed, "trace_id": trace_id, "cost": cost,
            "assertions": assertions, "grade": grade}


def _ticket_text(ticket: dict) -> str:
    return f"From: {ticket['customer_email']}\n{ticket['body']}"


def run_suite(*, trigger: str = "manual", only: str | None = None, path: Path = SUITE) -> dict:
    cfg = settings()
    suite = yaml.safe_load(path.read_text(encoding="utf-8"))
    gate = suite["gate"]
    cases = [c for c in suite["cases"] if not only or c["id"] == only]

    providers = build_providers(cfg)
    router = ModelRouter(providers)
    real = [p for p in providers if p.name != "offline"]
    judge_router = ModelRouter(real) if real else None

    conn = psycopg.connect(cfg.database_url_agent, autocommit=True, row_factory=dict_row)
    eval_run_id = str(conn.execute(
        """insert into eval_runs (trigger, git_sha, model_chain, judge_model)
           values (%s, %s, %s, %s) returning id""",
        (trigger, _git_sha(), [p.name for p in providers],
         f"{real[0].name}/{real[0].model}" if real else None),
    ).fetchone()["id"])

    results = [run_case(conn, router, judge_router, c, eval_run_id, gate["judge_threshold"]) for c in cases]

    passed = sum(r["passed"] for r in results)
    safety_failed = sum(1 for r in results if not r["passed"] and r["case"]["category"] == "safety")
    rate = passed / len(results) if results else 0.0
    gate_passed = safety_failed == 0 and rate >= gate["min_pass_rate"]
    conn.execute(
        """update eval_runs set finished_at = now(), cases = %s, passed = %s, safety_failed = %s,
             pass_rate = %s, gate_passed = %s, cost_usd = %s where id = %s""",
        (len(results), passed, safety_failed, round(rate * 100, 2), gate_passed,
         sum(r["cost"] for r in results), eval_run_id),
    )
    conn.close()
    _sync_dataset(results, eval_run_id)
    return {"eval_run_id": eval_run_id, "results": results, "passed": passed,
            "safety_failed": safety_failed, "rate": rate, "gate_passed": gate_passed,
            "judge": judge_router is not None, "min_pass_rate": gate["min_pass_rate"]}


def _sync_dataset(results: list[dict], eval_run_id: str) -> None:
    """Mirror the suite as a Langfuse dataset and this run as a dataset run."""
    t = tracer()
    if not t.enabled:
        return
    t.flush()
    t.ensure_dataset(DATASET, "Golden tickets with known right answers (core/evals/golden.yaml)")
    for r in results:
        c = r["case"]
        t.upsert_dataset_item(DATASET, c["id"], input={"from": c["from"], "body": c["body"]},
                              expected=c.get("expect", {}),
                              metadata={"category": c["category"], "description": c["description"]})
        t.link_dataset_run(DATASET, c["id"], f"eval-{eval_run_id[:8]}", r["trace_id"])


def print_report(report: dict) -> None:
    print()
    for r in report["results"]:
        c = r["case"]
        mark = "PASS" if r["passed"] else "FAIL"
        judge_note = ""
        if r["grade"] and "overall" in r["grade"]:
            judge_note = f"  judge {r['grade']['overall']}/5"
        print(f"  {mark}  [{c['category']:9}] {c['id']}{judge_note}")
        for name, ok, detail in r["assertions"]:
            if not ok:
                print(f"          ✗ {name} {detail}")
    print()
    print(f"  {report['passed']}/{len(report['results'])} passed ({report['rate']:.0%}), "
          f"safety failures: {report['safety_failed']}, "
          f"judge: {'on' if report['judge'] else 'skipped (no real model configured)'}")
    print(f"  gate (no safety failure, pass rate >= {report['min_pass_rate']:.0%}): "
          f"{'OPEN' if report['gate_passed'] else 'CLOSED'}")
