# agentdesk — project rules

Portfolio project: a governed platform for customer-support agents (see README). It exists to
show, with running code, what Applied AI / AI Platform roles ask for (Supabase AI Platform
Engineer, Mistral, ElevenLabs, n8n): controlled and verified agents, error handling, tracing and a
live dashboard. The store is a demo with simulated traffic; say so wherever it is presented. No
ControlC code, data or credentials, ever.

## Deviations from the personal standard (`C:\Personal Dev\CLAUDE.md`)

- **Python core**, not Next.js end to end: the target roles ask for Python. Next.js is only the
  dashboard.
- **Supabase** (local via `npx supabase@2.120.0`, Postgres 17), not `postgres-shared`: Realtime
  powers the dashboard and the target company is Supabase.
- **GCP** (Cloud Run, Pub/Sub, BigQuery, Terraform) is the planned deployment, not Coolify,
  because the target roles ask for it. Not set up yet.
- No Drizzle: migrations are plain SQL in `supabase/migrations/`.

## Rules

- **Governance lives in the database.** The worker connects as `desk_agent`, the API as
  `desk_api`, the dashboard as `anon` (RLS, read-only on platform tables). A new table needs
  explicit grants and RLS in its migration; `test_governance.py` must keep proving that the agent
  role cannot refund, send, change orders or decide proposals.
- **Agents propose, humans decide.** Only `approvals.py` executes a refund or a message, and it
  re-validates against the database. The recipient is always the ticket's sender.
- **Tools are bound to the ticket**: the customer is never a model-chosen argument.
- **Effects are atomic**; run steps are logged live on their own autocommit writes.
- **Every model call goes through `ModelRouter`** (retry, fallback, breaker) and is recorded by
  `RunRecorder` (database + Langfuse). Tracing never blocks or breaks a run.
- The `offline` provider is a labelled deterministic stand-in for keyless dev, tests and demos.
- **Telegram** (`telegram.py`, `desk_api` role) decides through `approvals.decide()` like the
  dashboard and only accepts callbacks from `TELEGRAM_CHAT_ID`. It shares cerebro's bot, which only
  sends, so long polling here does not conflict; if cerebro ever sets a webhook, give agentdesk its
  own bot.
- Langfuse is the self-hosted one on Coolify; traces carry `environment=agentdesk-dev`.
- **Evaluations** (`core/evals/golden.yaml`, `agentdesk.evals`) run against the `eval.*` fixtures in
  `supabase/seed.sql`; the simulator never touches them. Eval runs carry `runs.eval_run_id` and are kept
  out of every live view. A prompt or agent change must keep `agentdesk eval --gate` open.
- **/info is served from the code**: `GET /meta` returns prompts, tool schemas, settings and the suite.
  Change behaviour in the core and /info follows; only prose lives in the dashboard.
- **n8n workflows are generated**: edit `n8n/build.py`, run it, re-import. Never hand-edit the JSON.
- Code, comments, UI and docs in English (international portfolio).

## Local dev

```bash
npx supabase@2.120.0 start   # db :54322, API :54321, Studio :54323
cd core && uv run agentdesk api | worker | simulate | telegram
cd dashboard && pnpm dev --port 3020
cd core && uv run pytest
cd core && uv run agentdesk eval --gate
```

`npx supabase@2.120.0 db reset` re-applies migrations and the seed (wipes local data).
