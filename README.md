# agentdesk

**A team of AI agents that handles customer support for an online store. They answer
emails, chats and calls, but none of them can refund money or send anything to a customer
without a human approving it. Everything is visible live on a dashboard.**

The store and its customers are a demo with simulated traffic. The platform underneath is
real: a durable queue, a model-agnostic runtime, a tool gateway with risk tiers, guards, human
approval, tracing and a live control room.

## The two-minute demo

1. A customer writes "my order arrived broken". The ticket lands in the queue.
2. The dashboard shows the run live: the triage agent, then the resolver calling its tools,
   tokens, cost, latency and a link to the trace in Langfuse.
3. The resolver *proposes* a reply and a refund. A human approves them on the dashboard; only
   then is anything executed, and it is written to the audit log.
4. Click **Simulate outage** on a model provider. Calls are retried with backoff, fall back to
   the next provider, the circuit breaker opens, and jobs that run out of attempts land in the
   dead letter queue with a **Retry** button.

## The dashboard

`Overview` (KPIs, throughput, what needs a decision), `Runs` (every run with its steps),
`Approvals`, `Queue` (dead letters with retry), `Agents` (the registry and risk tiers), `Evals`,
`Audit log`, and `/info`: a seven-tab guide to how the whole system works, with diagrams, worked
examples and links to the n8n workflows and Langfuse. Light and dark themes. Everything updates
live through Supabase Realtime.

**Ask the guide.** `/info` has a chat with the *explainer*, a third registered agent (tier 0, no
tools) that answers questions about the platform in any language, from a hand-written guide
(`core/src/agentdesk/explain.py`) and from what the running code reports about itself (`GET /meta`).
It goes through the same model router and run recorder as the other agents, so every question is a
run on `Runs` with its cost and a Langfuse trace. Without a model key it quotes the most relevant
section of the guide. The dashboard calls `POST /explain`; it is on only where
`DASHBOARD_ACTIONS_ENABLED=true`.

## How the agents are controlled

| Layer | What it guarantees |
|---|---|
| Registry (`agents` table) | Nothing runs without a registered owner, risk tier and tool grant. |
| Tool gateway (`gateway.py`) | An agent is only offered its granted tools; anything else is refused and logged. Tools are bound to the ticket's sender, so an agent cannot look up another customer. |
| Database roles | Agents run as `desk_agent`, which has **no grant** to refund, change an order, send a message or decide a proposal. The forbidden write is impossible, not discouraged (`tests/test_governance.py` proves it). |
| Guards (`guards.py`) | Block invented orders, refunds above the order total or on someone else's order, and leaked emails. Flag promises and prompt-injection attempts for the reviewer. |
| Human approval (`approvals.py`) | The only code path that refunds or sends. Re-validates everything against the database. Idempotent: approving twice does nothing. |

Risk tiers: 0 reads internal data, 1 drafts for a human, 2 sends to a customer after approval,
3 moves money after approval.

## How errors are handled

- **Idempotent ingest**: a redelivered webhook with the same `external_id` is one ticket.
- **Durable queue on Postgres**: `FOR UPDATE SKIP LOCKED`, exponential backoff with jitter,
  dead letter queue, and lease expiry so a job survives a worker crash or deploy.
- **Model router**: retries per provider, fallback across providers (Mistral, then Claude),
  per-provider circuit breakers whose state is published live.
- **Atomic effects**: a run's steps are logged as they happen, but what it changes (proposals,
  ticket status, audit entry) is committed in one transaction, all or nothing.
- **Fault injection**: the `chaos` table takes a provider down on demand.

## Architecture

```
 email / chat / form / voice ──▶ API (FastAPI) ──▶ jobs (Postgres queue) ──▶ worker
                                                                               │
                         Mistral ◀── model router (retry, fallback, breaker) ◀─┤
                         Claude                                                │
                         offline                tool gateway (desk_agent role) ◀┤
                                                guards ◀────────────────────────┤
                                                proposals (atomic) ◀────────────┘
 dashboard (Next.js, Supabase Realtime) ◀── runs, steps, jobs, proposals, health
 human approval ──▶ API (desk_api role) ──▶ refunds / outbound messages / audit log
 every LLM call and tool call ──▶ Langfuse
```

## Run it locally

Requirements: Docker, Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 22 with pnpm.

```bash
npx supabase@2.120.0 start          # Postgres, Realtime, Studio; applies migrations and seed
cd core && uv sync
uv run agentdesk api                # http://127.0.0.1:8000
uv run agentdesk worker
uv run agentdesk simulate --per-minute 10
uv run agentdesk telegram           # optional: approvals and alerts in Telegram
cd ../dashboard && cp .env.example .env.local   # paste ANON_KEY from `npx supabase status`
pnpm install && pnpm dev --port 3020            # http://localhost:3020
```

Without API keys the worker uses the `offline` model, a deterministic rule-based stand-in so the
whole pipeline runs anywhere. Set `MISTRAL_API_KEY` and/or `ANTHROPIC_API_KEY` in `core/.env` for
real models, the Langfuse keys for tracing (self-hosted at `langfuse.senaproject.online`, traces
tagged with environment `agentdesk-dev`), and `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` for
approvals from your phone.

## Telegram

`agentdesk telegram` turns each new proposal into a card with Approve / Reject buttons. A press
goes through the same approval path as the dashboard (re-validated, audited); presses from any
other chat are refused. At most `TELEGRAM_CARDS_PER_HOUR` cards are sent; beyond that, proposals
are bundled into one digest. Alerts (dead letters, open circuits) are deduplicated: one message per
30 minutes per alert, with the count of repeats suppressed.

```bash
cd core && uv run pytest     # router, breaker, guards, Telegram, and the database-role guarantees
cd core && uv run agentdesk eval --gate   # the golden suite; exits 1 when the gate is closed
```

## Evaluations

`core/evals/golden.yaml` holds twelve tickets with known right answers (six of them safety
traps) against fixed fixtures. `agentdesk eval` runs each one through the real agents, checks
behavioural assertions, grades the reply with an LLM judge when a real model is configured,
stores the results (dashboard › Evals) and mirrors them to Langfuse as a dataset run with scores.
CI runs it with `--gate` on every push.

## n8n

`n8n/build.py` authors the workflows as data and writes the JSON imported into n8n (folder
`agentdesk`): a shared create-ticket sub-workflow, an intake webhook, a hosted contact form, a
traffic generator, a daily report and an error handler. They need two credentials created in n8n,
"agentdesk API (Bearer)" and "Telegram · Gustavo Asistente", and the API's public URL.

## Roadmap

- [x] Phase 0: queue, runtime, gateway, guards, approvals, live dashboard, fault injection
- [x] Telegram approvals, interruption budget, deduplicated alerts
- [ ] Dashboard login
- [x] Evaluation layer: golden suite, judge rubric, safety cases, CI gate, Langfuse datasets
- [x] n8n workflows: intake webhook, contact form, traffic generator, daily report, error handler
- [ ] MCP server over runs, audit log and evals
- [ ] GCP: Cloud Run, Pub/Sub, BigQuery run warehouse, Terraform
- [x] Voice channel with ElevenLabs Agents: order lookups and ticket filing, caller signed by the API
- [ ] n8n community node and templates
- [ ] Small LoRA fine-tune of an open Mistral model for triage, compared on accuracy and cost
- [ ] ROI ledger: work absorbed per agent per month
