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
cd ../dashboard && cp .env.example .env.local   # paste ANON_KEY from `npx supabase status`
pnpm install && pnpm dev --port 3020            # http://localhost:3020
```

Without API keys the worker uses the `offline` model, a deterministic rule-based stand-in so the
whole pipeline runs anywhere. Set `MISTRAL_API_KEY` and/or `ANTHROPIC_API_KEY` in `core/.env` for
real models, and the Langfuse keys for tracing.

```bash
cd core && uv run pytest     # router, breaker, guards, and the database-role guarantees
```

## Roadmap

- [x] Phase 0: queue, runtime, gateway, guards, approvals, live dashboard, fault injection
- [ ] Telegram approvals, deduplicated alerts, dashboard login
- [ ] Evaluation layer: golden suites, judge rubric, safety cases, CI gate that blocks regressions
- [ ] MCP server over runs, audit log and evals
- [ ] GCP: Cloud Run, Pub/Sub, BigQuery run warehouse, Terraform
- [ ] Voice channel with ElevenLabs Agents
- [ ] n8n community node and templates
- [ ] Small LoRA fine-tune of an open Mistral model for triage, compared on accuracy and cost
- [ ] ROI ledger: work absorbed per agent per month
