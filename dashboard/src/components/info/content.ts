// Prose shared by the tabs of /info, kept apart from layout so each tab stays short.

export const TOUR = [
  ["Overview", "/", "Is it healthy? Tickets, success rate, latency, cost, and what is waiting for you."],
  ["Runs", "/runs", "Open any run to see each step, then jump to its full trace in Langfuse."],
  ["Approvals", "/approvals", "Approve a refund. It runs only now, after a re-check, and lands in the audit log."],
  ["Top bar", "/", "“simulate outage” on a provider: watch retries, fallback and the circuit breaker."],
  ["Queue", "/queue", "Jobs out of retries wait here with a Retry button instead of being lost."],
  ["Agents", "/agents", "The registry: who owns each agent, its risk tier, the exact tools it may call."],
  ["Evals", "/evals", "The golden suite, case by case, and whether the gate is open."],
  ["Audit log", "/audit", "Who decided what, and when: agents, people, the system."],
] as const;

export const LIFECYCLE = [
  ["A message arrives", "From the n8n contact form or webhook (or the simulator), the API receives it. The sender's message id makes a redelivered webhook a no-op; the ticket and its job are written in one transaction.", "api.py · POST /tickets"],
  ["It waits in a durable queue", "A Postgres table, not a separate broker. Workers claim jobs with FOR UPDATE SKIP LOCKED, are woken instantly by LISTEN/NOTIFY, and hold a lease so a crashed worker's job is picked up again.", "jobs.py · claim()"],
  ["Triage classifies it", "A tier 0 agent with no tools returns intent, language and urgency as a schema-checked tool call. A malformed answer gets one repair turn; a second failure fails the attempt and the queue retries it later.", "agents/runner.py · run_triage()"],
  ["The resolver looks things up", "A tier 1 agent alternates model calls and tool calls. The gateway offers it three read-only tools, always scoped to the ticket's sender, so it cannot read another customer's orders.", "gateway.py · Gateway.call()"],
  ["Guards check the draft", "Order ids it never looked up, refunds above what is left on the order or on another customer's order, and leaked emails block the run. Promises and prompt injection are flagged for the reviewer.", "guards.py · check_resolution()"],
  ["Effects become proposals", "A reply (tier 2) and maybe a refund (tier 3) are written as pending proposals, together with the ticket status and an audit entry, in one transaction: all or nothing.", "pipeline.py · process_ticket()"],
  ["A person decides", "On the dashboard or with a button in Telegram. Both use the same executor, which locks the proposal, re-checks the refund against the order and ignores a second click.", "approvals.py · decide()"],
  ["Everything is on the record", "Each run and step is in the database as it happens (that is what the dashboard shows live), each model and tool call is in Langfuse, and each decision is in the audit log.", "recorder.py · RunRecorder"],
];

export const GOVERNANCE = [
  ["Registry", "An agent runs only with a registered owner, risk tier and tool grant. Remove the row and it stops."],
  ["Tool gateway", "The model is offered only its granted tools; anything else is refused and logged as a blocked step."],
  ["Database roles", "Agents connect as desk_agent, which has no permission on refunds, outgoing messages or decisions. The forbidden write has no code path, and a test proves the database refuses it."],
  ["Guards", "Deterministic checks on the output, against the database rather than against what the model claims it saw."],
  ["Human approval", "The only path that refunds or sends. Re-validates, locks the row, records who decided."],
];

export const CODE = [
  ["core/src/agentdesk/api.py", "HTTP API: tickets, decisions, dead-letter retries, fault injection, /meta, /stats, /simulate"],
  ["core/src/agentdesk/worker.py", "Worker threads, LISTEN/NOTIFY wake-up, lease reclaim, dead letters"],
  ["core/src/agentdesk/pipeline.py", "Triage → resolve → guards → proposals, idempotent and atomic"],
  ["core/src/agentdesk/llm/", "Mistral and Anthropic adapters, the offline stand-in, the router with retry, fallback and breakers"],
  ["core/src/agentdesk/gateway.py", "Granted tools, bound to the ticket's sender"],
  ["core/src/agentdesk/guards.py", "Blocks and flags on agent output"],
  ["core/src/agentdesk/approvals.py", "The only code that refunds or sends"],
  ["core/src/agentdesk/telegram.py", "Approval cards, digest, deduplicated alerts"],
  ["core/src/agentdesk/evals/", "Golden suite runner, assertions, judge"],
  ["core/evals/golden.yaml", "The evaluation cases"],
  ["supabase/migrations/", "Schema, roles, grants and RLS: where governance is enforced"],
  ["n8n/build.py", "The n8n workflows, authored as data"],
  ["dashboard/", "This Next.js app, live through Supabase Realtime"],
  [".github/workflows/ci.yml", "Lint, tests and the evaluation gate on every push"],
];

export const STACK = [
  ["Core", "Python 3.12, FastAPI, psycopg 3, Pydantic"],
  ["Models", "Mistral and Anthropic over plain HTTP; offline stand-in for keyless runs"],
  ["Data", "Supabase: Postgres 17, Realtime, row level security"],
  ["Automation", "n8n: intake webhook, contact form, traffic, daily report, error handler"],
  ["Tracing", "Langfuse, self-hosted, via its ingestion API; datasets and scores for evals"],
  ["Approvals", "Dashboard and Telegram inline buttons"],
  ["Dashboard", "Next.js 16, React 19, Tailwind 4"],
  ["Quality", "pytest, ruff, golden-suite evaluation gate in GitHub Actions"],
  ["Deployment", "Google Cloud: Cloud Run, Terraform (in progress)"],
];
