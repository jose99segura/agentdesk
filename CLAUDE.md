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
- **The explainer** (`explain.py`, "Ask the guide" on /info) is a registered agent like the others:
  router, recorder, trace. Its `GUIDE` is hand-written prose; when behaviour changes, update it, or
  the agent will explain the old behaviour. n8n workflow ids and the Langfuse project live there
  and in `dashboard/src/components/info/content.ts`.
- **n8n workflows are generated**: edit `n8n/build.py`, run it, re-import. Never hand-edit the JSON.
- Code, comments, UI and docs in English (international portfolio).

## Voice channel (ElevenAgents)

`voice.py` + `voice_setup.py`. The ElevenLabs agent and its two webhook tools are generated:
edit `voice_setup.py` and run `uv run agentdesk voice-setup --api-url <public API>`, never edit
them in the ElevenLabs UI. ElevenLabs must reach the API, so the agent points at production;
locally the call bar only works against a tunnel.

- The caller is bound by the API (`sign_caller`, keyed by `VOICE_TOOL_SECRET`), passed as the
  `caller` dynamic variable and checked on every tool call. Never let a tool take the customer
  from a model argument.
- Tools: `X-Agentdesk-Voice` header = `VOICE_TOOL_SECRET`. Post-call webhook: `elevenlabs-signature`
  (`t=<ts>,v0=<hmac(ts.body)>`) with `ELEVENLABS_WEBHOOK_SECRET`, which ElevenLabs generates when the
  workspace webhook is created.
- Terraform: `with_voice` (API key + tool secret pushed), `with_voice_webhook`,
  `elevenlabs_agent_id` (in `terraform.tfvars`).

## Production database

Supabase project `cinyqwetgzjgfcgzinxo` on the **personal** account (never the TS Lux / Control C
connector). Migrations go with the CLI, linked once by the user (`supabase login --token`, then
`supabase link --project-ref cinyqwetgzjgfcgzinxo`; the link lives in the gitignored `supabase/.temp`):

```bash
npx supabase@2.120.0 db push --dry-run   # always look first
npx supabase@2.120.0 db push
```

`seed.sql` is local-only (dev role passwords, demo store, eval fixtures) and is never pushed. In
production the `desk_agent` / `desk_api` login passwords are set by hand when the API is deployed,
and the demo store is loaded separately. All six migrations were applied on 2026-10-08 and checked:
19 tables with RLS, the agent role without grants on refunds-write, outbound messages or decisions,
and anon able to read the platform tables but not the store.

## Production on Google Cloud

Project `agentdesk-jose99` (billing on the personal account), region `europe-west1`, all in
`infra/` (Terraform, local state in `infra/`, gitignored).

| Service | URL | Access |
|---|---|---|
| API | https://agentdesk-api-pzm2fnni7a-ew.a.run.app | public; bearer token on every route but /health, /meta and the Telegram webhook (secret header) |
| Dashboard | https://agentdesk-dashboard-pzm2fnni7a-ew.a.run.app | public, read-only (`DASHBOARD_ACTIONS_ENABLED=false`: no login yet) |
| Worker | https://agentdesk-worker-pzm2fnni7a-ew.a.run.app | private: only the invoker service account (Pub/Sub push, Scheduler) |

- **Deploy:** `bash infra/deploy.sh agentdesk-jose99` builds both images on Cloud Build (tagged
  with the commit), applies Terraform and re-registers the Telegram webhook. Commit first.
- **Secrets:** values only in Secret Manager. `bash infra/secrets.sh push` re-sends them from
  `core/.env` and `infra/.secrets/generated.env` (role passwords, API token, webhook secret),
  both gitignored. A new Anthropic key also needs `with_anthropic = true` in Terraform.
- **Production DB bootstrap** (role passwords + demo store) was applied with
  `supabase db push --include-roles` from a temporary `supabase/roles.sql`, deleted right after;
  never commit that file.
- Telegram runs by **webhook** in production; the local `agentdesk telegram` therefore starts in
  send-only mode while the webhook is set.
- Verified on 2026-10-08: a ticket went API → Pub/Sub → worker → Mistral → proposals in 28 s
  (cold start), and the Scheduler sweep sent its Telegram cards a minute later.

## Local dev

```bash
npx supabase@2.120.0 start   # db :54322, API :54321, Studio :54323
cd core && uv run agentdesk api | worker | simulate | telegram
cd dashboard && pnpm dev --port 3020
cd core && uv run pytest
cd core && uv run agentdesk eval --gate
```

`npx supabase@2.120.0 db reset` re-applies migrations and the seed (wipes local data).
