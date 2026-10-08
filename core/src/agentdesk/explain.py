"""The explainer: an agent that answers questions about agentdesk itself.

It is registered like every other agent (tier 0, no tools) and goes through the same
ModelRouter and RunRecorder, so asking the guide a question shows up as a run, with its
tokens, cost and trace, like any other agent call. It reads two things: the guide below,
written by hand, and what the running code reports about itself (`meta.describe()`:
prompts, tool schemas, settings, evaluation cases), so an answer about those can never
drift from the code. Without a model key the offline provider answers by quoting the
most relevant section of the guide, labelled as such.
"""

import json
import re
import uuid
from collections import Counter
from dataclasses import dataclass

from psycopg import Connection

from .agents.runner import load_agent
from .llm.router import ModelRouter
from .llm.types import Message
from .recorder import RunRecorder
from .tracing import tracer

MARKER = "You are the guide of agentdesk."
MAX_HISTORY = 8

N8N = "https://n8n.senaproject.online"
N8N_FOLDER = f"{N8N}/projects/7d6T3aexJ0y2nZTb/folders/OET1fRISh0fNtg0T/workflows"
N8N_WORKFLOWS = [
    ("00 · create ticket (shared)", "d0wroeRD2aWu0Igr"),
    ("01 · intake webhook", "52qKtgnCUR00CsMO"),
    ("02 · contact form", "a6GFO0sMvdIytJ13"),
    ("03 · traffic generator", "sSTS3uOfS3hI6LmK"),
    ("04 · daily report", "IpX9bPIvZbWsTzPP"),
    ("99 · error handler", "jjaASFOXhI6BKjXr"),
]
LANGFUSE = "https://langfuse.senaproject.online/project/cmuzbb1t2000gp708h15hk9ns"

GUIDE = f"""## What it is
agentdesk is a governed platform for AI customer-support agents, built as a portfolio project.
A team of AI agents handles support for an online homeware store: they read each ticket, look up
the customer and the order, draft a reply and sometimes propose a refund. They cannot send
anything or move money on their own: every reply and refund waits for a person to approve it.
Everything is visible live on a dashboard and recorded step by step.
The store and its customers are a demo with simulated traffic. The platform is real: a durable
queue, a model-agnostic runtime, a tool gateway with risk tiers, guards, human approval, tracing,
evaluations and a live control room.
It exists to show, with running code, what Applied AI / AI Platform roles ask for: controlled and
verified agents, error handling, tracing and a live dashboard.

## The two agents
- Triage (tier 0, no tools): one forced model call that returns intent, language and urgency as a
  schema-checked tool call. A malformed answer gets one repair turn; a second failure fails the
  attempt and the queue retries later.
- Resolver (tier 1): a loop of up to 6 rounds. The model may call its three granted read-only
  tools (get_customer, list_orders, get_order), each result goes back as a tool message, and it
  finishes by calling submit_resolution with a reply, an optional refund and a needs_human flag.
  The last round offers only submit_resolution and forces it, so the loop always ends.
- Explainer (tier 0, no tools): this agent, answering questions about the platform on /info.
Agents answer by filling in a form (a JSON schema), never free text, so every field is checked
before a person sees it.

## The life of a ticket
1. A message arrives from the n8n contact form or webhook, or the simulator. POST /tickets stores
   the ticket and its job in one transaction; the sender's message id makes a redelivered webhook
   a no-op (idempotent ingest).
2. It waits in a durable queue: a Postgres table, not a separate broker. Workers claim jobs with
   FOR UPDATE SKIP LOCKED, are woken instantly by LISTEN/NOTIFY, and hold a lease so a crashed
   worker's job is picked up again.
3. Triage classifies it (intent, language, urgency).
4. The resolver looks things up through the gateway, scoped to the ticket's sender.
5. Guards check the draft against the database.
6. Effects become proposals: a reply (tier 2) and maybe a refund (tier 3), written as pending
   proposals together with the ticket status and an audit entry, in one transaction.
7. A person decides, on the dashboard or with a button in Telegram. The executor locks the
   proposal, re-checks the refund against the order and ignores a second click.
8. Everything is on the record: runs and steps in the database as they happen, model and tool
   calls in Langfuse, decisions in the audit log.

## Governance: how the agents are controlled
Five layers, from weakest to strongest:
- Registry (agents table): nothing runs without a registered owner, risk tier and tool grant.
  Remove or deactivate the row and the agent stops.
- Tool gateway (gateway.py): the model is only offered its granted tools; anything else is refused
  and logged as a blocked step. Tools are bound to the ticket's sender, so an agent cannot look up
  another customer's orders: the customer is never a model-chosen argument.
- Database roles: the worker connects as desk_agent, which has no grant to refund, change an
  order, send a message or decide a proposal. The forbidden write is impossible, not discouraged;
  tests/test_governance.py proves the database refuses it. The API connects as desk_api, the
  dashboard as anon (row level security, read-only on platform tables).
- Guards (guards.py): deterministic checks on the output, against the database rather than
  against what the model claims. Blocks: invented orders, refunds above what is left on the order,
  refunds on another customer's order, leaked emails. Flags for the reviewer: promises
  (commitment language), long replies, possible prompt injection, agent requested a human.
- Human approval (approvals.py): the only code path that refunds or sends. It re-validates
  everything against the database, locks the row, records who decided, and is idempotent.

## Risk tiers
0 reads internal data, 1 drafts for a human, 2 sends to a customer after approval, 3 moves money
after approval. Agents themselves are tier 0 or 1; tiers 2 and 3 exist only as proposals a human
decides.

## Every path a ticket can take
- Information only (order status, returns, product questions): one reply to approve.
- Reply + refund (damaged item or refund request on a delivered order with money left): two cards,
  each executed or rejected on its own.
- Needs a decision (cancellations, disputes): a reply flagged "agent requested human".
- Order not on the account: a reply that reveals nothing.
- Flagged (prompt injection, a promised date): the same cards with a flag, nothing blocked.
- Blocked (invented order, refund above what is left, another customer's data): nothing to approve;
  the ticket goes to needs_human with the reason, logged in the audit log.
- Model down: usually another model answers; if all fail the job is retried later, then lands in
  the dead letter queue with a Retry button.
- Re-check fails on approval (the order changed since the agent looked): the proposal is marked
  failed with the reason and nothing is executed.

## How errors are handled
- Idempotent ingest: a redelivered webhook with the same external_id is one ticket.
- Durable queue on Postgres: FOR UPDATE SKIP LOCKED, exponential backoff with jitter, a dead
  letter queue after the maximum attempts, lease expiry so a job survives a worker crash or deploy.
- Model router (llm/router.py): providers are tried in order (Mistral, then Claude, then the
  offline stand-in), each up to two attempts with jittered backoff on transient errors; a
  per-provider circuit breaker opens after three consecutive failures and probes again after a
  cooldown (closed -> open -> half_open -> closed). Breaker state is published live to the top bar.
  Every retry, skip and fallback is recorded as a run step.
- Atomic effects: a run's steps are logged as they happen on autocommit writes, but what it changes
  (proposals, ticket status, audit entry) is committed in one transaction, all or nothing.
- Fault injection: the chaos table takes a provider down on demand ("simulate outage" on the top
  bar), so retries, fallback and the breaker can be watched live.
- Failures stay visible: the Queue page lists dead letters, Overview counts fallbacks and guard
  blocks.

## Observability
Three records of the same work, each answering a different question:
- The dashboard (Next.js, Supabase Realtime) shows that something happened: Overview (KPIs,
  throughput, what needs a decision), Runs (every run with its steps), Approvals, Queue (dead
  letters with retry), Agents (registry and risk tiers), Evals, Audit log, and /info.
- Langfuse (self-hosted, {LANGFUSE}) shows why: for any ticket, exactly what the model was told,
  what it looked up, what it answered and what it cost. One trace per ticket, a generation per
  model call, a span per tool call and guard; traces carry environment agentdesk-dev. Tracing is
  fire-and-forget: it never blocks or breaks a run.
- The audit log shows who decided what and when: agents, people, the system.

## Evaluations
core/evals/golden.yaml holds twelve tickets with known right answers, six of them safety traps
(prompt injection, another customer's order, refund above the total, invented orders...), against
fixed fixtures (the eval.* customers and orders in the seed, which the simulator never touches).
`agentdesk eval` runs each case through the real agents, checks behavioural assertions (intent,
tools used, refund amount, flags, blocks), grades the reply with an LLM judge when a real model
is configured, stores the results (dashboard > Evals) and mirrors them to Langfuse as a dataset
run with scores. The gate: a minimum pass rate and no failed safety case. CI runs
`agentdesk eval --gate` on every push and fails the build when the gate is closed. Eval runs carry
runs.eval_run_id and are kept out of every live view and KPI.

## n8n: the edges
n8n owns the outside world (forms, webhooks, schedules, Telegram) and hands the work to the
platform through its API; agents, rules and retries stay in the platform. Six workflows live in
the agentdesk folder of the self-hosted instance ({N8N_FOLDER}), authored as data in n8n/build.py
(edit the script, run it, re-import; never hand-edit the JSON):
- 00 · create ticket (shared): the one place where a message becomes a ticket. Cleans the input,
  rejects what is invalid, calls POST /tickets with three retries, alerts on Telegram if the API
  stays down. Both entry points call it, so the rules live once.
- 01 · intake webhook: a POST endpoint for a chat widget or website; answers 202 with the ticket
  id, 400 for bad input, 503 if the platform is unreachable.
- 02 · contact form: a form hosted by n8n (email, order number, message) with a confirmation page.
- 03 · traffic generator: every 15 minutes during the day, one to three simulated customers write
  in through POST /simulate.
- 04 · daily report: at 08:00 reads GET /stats (tickets, success rate, latency, cost, decisions,
  backlog, last evaluation) and sends one Telegram message.
- 99 · error handler: registered as the error workflow of all the others; sends the workflow, the
  failing node, the error and a link to the execution to Telegram.
They need two credentials in n8n ("agentdesk API (Bearer)" and "Telegram · Gustavo Asistente") and
the API's public URL; they are switched on once the API is deployed.

## Telegram
`agentdesk telegram` turns each new proposal into a card with Approve / Reject buttons. A press
goes through the same approval path as the dashboard (re-validated, audited); presses from any
chat other than TELEGRAM_CHAT_ID are refused. At most TELEGRAM_CARDS_PER_HOUR cards are sent;
beyond that, proposals are bundled into one digest (an interruption budget). Alerts (dead
letters, open circuits) are deduplicated: one message per 30 minutes per alert, with the count
of repeats suppressed. It shares the bot with the cerebro project, which only sends.

## Stack and code map
- Core: Python 3.12, FastAPI, psycopg 3, Pydantic; models over plain HTTP (Mistral, Anthropic),
  offline stand-in for keyless runs. Dashboard: Next.js 16, React 19, Tailwind 4, Supabase
  Realtime. Data: Supabase (Postgres 17, Realtime, RLS), plain SQL migrations. Tracing: Langfuse.
  Automation: n8n. Quality: pytest, ruff, golden-suite gate in GitHub Actions.
- core/src/agentdesk/api.py: HTTP API (tickets, decisions, retries, chaos, /meta, /stats,
  /simulate, /explain). worker.py: threads, LISTEN/NOTIFY, lease reclaim, dead letters.
  pipeline.py: triage -> resolve -> guards -> proposals. llm/: adapters, offline, router.
  gateway.py, guards.py, approvals.py, telegram.py, evals/, explain.py (this agent).
  supabase/migrations/: schema, roles, grants and RLS. n8n/build.py. dashboard/.
- /info is served from the code: GET /meta returns prompts, tool schemas, settings and the
  evaluation suite, so the explanation cannot drift from what runs.

## Running it locally
`npx supabase@2.120.0 start` (db :54322, API :54321, Studio :54323); `cd core && uv run agentdesk
api | worker | simulate | telegram`; `cd dashboard && pnpm dev --port 3020`; `uv run pytest`;
`uv run agentdesk eval --gate`. Without API keys the worker uses the offline model.

## Status and roadmap
Done: queue, runtime, gateway, guards, approvals, live dashboard, fault injection, Telegram
approvals, evaluation layer, n8n workflows, the explainer. Planned: dashboard login, MCP server
over runs and evals, deployment on Google Cloud (Cloud Run, Pub/Sub, BigQuery, Terraform), a voice
channel with ElevenLabs, an n8n community node, a small LoRA fine-tune of a Mistral model for
triage, an ROI ledger.

## How to explain it in an interview
Thirty seconds: "I built a platform where AI agents handle customer support but cannot act alone.
They draft replies and refunds; a person approves from a dashboard or Telegram. The database role
the agents run on cannot refund or send, so the dangerous write is impossible rather than
discouraged. Every call is retried, falls back across providers and is traced in Langfuse, and a
golden suite with safety traps gates every change in CI."
Two minutes: add the life of a ticket, the five governance layers, the durable Postgres queue
with dead letters, the circuit breakers with fault injection you can trigger live, the atomic
effects, the evaluation gate, and n8n owning the edges while the platform owns the rules.
"""


def system_prompt(live: dict | None) -> str:
    """The explainer's instructions, the guide, and the live facts (omitted on /meta)."""
    facts = json.dumps(live, ensure_ascii=False, default=str) if live else "{live facts}"
    return f"""{MARKER} You answer questions about this platform for the person reading its
"How it works" page: a recruiter, an engineer, or its author preparing an interview.

Rules:
- Answer in the language of the question.
- Use only the guide and the live facts below. If something is not in them, say you do not know
  rather than guessing. Never invent numbers, names or features.
- Start with the plain-words answer in two or three sentences, then the technical detail if it
  helps. Short paragraphs or a short list; no headings.
- When it helps, say where to look: the dashboard page (Runs, Approvals, Queue, Evals, Audit log,
  /info tabs), the file in the repository, the n8n workflow or Langfuse.
- The person reading may not be an engineer: explain a term the first time you use it.

# Guide
{GUIDE}

# Live facts from the running code (prompts, tools, settings, evaluation cases)
{facts}
"""


@dataclass
class Section:
    title: str
    body: str


def sections() -> list[Section]:
    out = []
    for block in f"\n{GUIDE}".split("\n## ")[1:]:
        title, _, body = block.partition("\n")
        out.append(Section(title.strip(), body.strip()))
    return out


_WORD = re.compile(r"[a-záéíóúñü0-9]{3,}")
# Spanish words that map to the English guide, so keyless demos still find the section.
_SYNONYMS = {
    "reembolso": "refund", "reembolsos": "refund", "dinero": "money", "aprobar": "approve",
    "aprobación": "approval", "aprueba": "approve", "humano": "human", "persona": "person",
    "cola": "queue", "modelo": "model", "modelos": "model", "falla": "fail", "cae": "down",
    "caído": "down", "errores": "error", "reintento": "retry", "reintentos": "retry",
    "evaluación": "evaluation", "evaluaciones": "evaluations", "pruebas": "tests",
    "seguridad": "safety", "guardas": "guards", "herramientas": "tools", "herramienta": "tool",
    "agente": "agent", "agentes": "agents", "pedido": "order", "cliente": "customer",
    "entrevista": "interview", "explicar": "explain", "flujo": "workflow", "flujos": "workflows",
    "trazas": "traces", "traza": "trace", "registro": "log", "auditoría": "audit",
    "despliegue": "deployment", "permisos": "grant", "datos": "data", "arquitectura": "stack",
    "código": "code", "ejecutar": "running", "arrancar": "running", "controlan": "controlled",
    "controla": "controlled", "camino": "path", "caminos": "path", "ruta": "path",
}


def _tokens(text: str) -> set[str]:
    words = {w.lower() for w in _WORD.findall(text.lower())}
    words |= {_SYNONYMS[w] for w in words if w in _SYNONYMS}
    # A crude plural fold: evaluations ~ evaluation, workflows ~ workflow.
    return words | {w[:-1] for w in words if len(w) > 4 and w.endswith("s")}


def best_section(question: str) -> Section:
    """Keyword retrieval over the guide, weighted so words every section uses count little."""
    secs = sections()
    q = _tokens(question)
    df = Counter(t for s in secs for t in _tokens(f"{s.title} {s.body}"))

    def score(s: Section) -> float:
        title, body = _tokens(s.title), _tokens(s.body)
        return sum((3 if t in title else 1) / df[t] for t in q if t in title or t in body)

    best = max(secs, key=score)
    return best if score(best) > 0 else secs[0]


def offline_answer(question: str) -> str:
    s = best_section(question)
    return (f"No model key is configured, so this is the offline guide quoting its most relevant "
            f'section, "{s.title}":\n\n{s.body}')


def _as_dicts(messages: list[Message]) -> list[dict]:
    return [{"role": m.role, "content": m.content} for m in messages]


def answer(conn: Connection, router: ModelRouter, question: str, history: list[dict],
           live: dict) -> dict:
    """One question through the registered explainer, recorded like any other run."""
    load_agent(conn, "explainer")
    trace_id = uuid.uuid4().hex
    tracer().trace(trace_id, name="explain", input={"question": question}, tags=["explainer"])
    rec = RunRecorder(conn, agent_id="explainer", ticket_id=None, job_id=None, trace_id=trace_id)
    messages = [Message("system", system_prompt(live))]
    for turn in history[-MAX_HISTORY:]:
        messages.append(Message(turn["role"], turn["content"]))
    messages.append(Message("user", question))
    try:
        completion = router.complete(messages, [], None, rec)
        rec.llm(completion, _as_dicts(messages), completion.text)
    except Exception as exc:
        rec.step("error", type(exc).__name__, "error", output={"error": str(exc)})
        rec.finish("failed", error=str(exc)[:1000], error_kind=type(exc).__name__)
        raise
    rec.finish("succeeded")
    tracer().trace(trace_id, output={"answer": completion.text})
    return {
        "answer": completion.text,
        "provider": completion.provider,
        "model": completion.model,
        "run_id": rec.run_id,
        "trace_url": tracer().trace_url(trace_id),
        "cost_usd": round(rec.cost, 6),
        "latency_ms": completion.latency_ms,
    }
