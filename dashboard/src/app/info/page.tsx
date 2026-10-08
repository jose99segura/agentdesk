import type { Metadata } from "next";
import type { ReactNode } from "react";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "How it works" };

const LIFECYCLE = [
  {
    title: "A message arrives",
    body: "Email, chat, a form, or the simulator posts to the API. The sender's message id makes a redelivered webhook a no-op, and the ticket and its job are written in one transaction.",
    code: "api.py · POST /tickets",
  },
  {
    title: "It waits in a durable queue",
    body: "A Postgres table, not a broker. Workers claim jobs with FOR UPDATE SKIP LOCKED, are woken by LISTEN/NOTIFY, and hold a lease so a crashed worker's job is picked up again.",
    code: "jobs.py · claim()",
  },
  {
    title: "Triage classifies it",
    body: "A tier 0 agent with no tools returns intent, language and urgency as a schema-validated tool call. A malformed answer gets one repair turn, then the attempt fails and is retried.",
    code: "agents/runner.py · run_triage()",
  },
  {
    title: "The resolver looks things up",
    body: "A tier 1 agent loops over model calls and tool calls. The gateway offers it three read-only tools, always scoped to the ticket's sender, so it cannot read another customer's orders.",
    code: "gateway.py · Gateway.call()",
  },
  {
    title: "Guards check the draft",
    body: "Order ids it never looked up, refunds above what is left on the order or on someone else's order, and leaked emails block the run. Promises and prompt injection are flagged for the reviewer.",
    code: "guards.py · check_resolution()",
  },
  {
    title: "Effects become proposals",
    body: "A reply (tier 2) and maybe a refund (tier 3) are written as pending proposals, together with the ticket status and an audit entry, in one transaction: all or nothing.",
    code: "pipeline.py · process_ticket()",
  },
  {
    title: "A human decides",
    body: "On this dashboard or with a button in Telegram. Both go through the same executor, which locks the proposal, re-validates the refund against the order and is idempotent.",
    code: "approvals.py · decide()",
  },
  {
    title: "Everything is on the record",
    body: "Each run and step is in the database as it happens, each model and tool call is a span in Langfuse, and each decision is in the audit log with who made it.",
    code: "recorder.py · RunRecorder",
  },
];

const GOVERNANCE = [
  ["Registry", "An agent runs only with a registered owner, risk tier and tool grant. Remove the row and it stops."],
  ["Tool gateway", "The model is offered only granted tools; anything else is refused and logged as a blocked step."],
  ["Database roles", "Agents connect as desk_agent, which has no grant on refunds, outbound messages or decisions. The forbidden write does not exist in its code path, and a test proves the database refuses it."],
  ["Guards", "Deterministic checks on the output, against the database rather than against what the model claims to have seen."],
  ["Human approval", "The only path that refunds or sends. Re-validates, locks the row, records who decided."],
];

const RELIABILITY = [
  ["Idempotent ingest", "Unique external id per inbound message; the same webhook twice is one ticket."],
  ["Retries with backoff", "5s, 10s, 20s with jitter, four attempts, then the dead letter queue with a retry button."],
  ["Leases", "A job held by a worker that died is reclaimed after five minutes."],
  ["Provider fallback", "Each model call retries a transient error, then falls back: Mistral, then Claude, then the offline model."],
  ["Circuit breakers", "Three failures open a provider's circuit for 30 seconds; one probe decides whether it closes again. State is live on the top bar."],
  ["Atomic effects", "Steps are logged as they happen; changes are committed in one transaction, so a crash leaves a full log and no half-written state."],
  ["Fault injection", "“Simulate outage” takes a provider down on demand, to watch all of the above happen."],
  ["Interruption budget", "At most 20 Telegram cards an hour, then one digest. Alerts are deduplicated with a 30 minute cooldown."],
];

const STACK = [
  ["Core", "Python 3.12, FastAPI, psycopg 3, Pydantic"],
  ["Models", "Mistral and Anthropic over plain HTTP, one adapter each"],
  ["Data", "Supabase (Postgres 17, Realtime, RLS)"],
  ["Dashboard", "Next.js 16, React 19, Tailwind 4"],
  ["Tracing", "Langfuse, self-hosted, via its ingestion API"],
  ["Approvals", "Telegram Bot API, inline buttons"],
  ["Tests", "pytest: router, breaker, guards, Telegram, database roles"],
  ["Planned", "GCP (Cloud Run, Pub/Sub, BigQuery, Terraform), evals with a CI gate, MCP server, ElevenLabs voice, n8n node"],
];

export default function InfoPage() {
  return (
    <article className="mx-auto max-w-4xl">
      <header className="mb-10">
        <p className="text-xs font-medium uppercase tracking-widest text-brand">How it works</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Agents that do the work, humans who make the calls</h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          agentdesk is a team of AI agents handling customer support for an online store. They read each message, look up the
          customer and the order, and draft a reply or a refund. None of them can send anything or move money: those actions only
          exist as proposals a person approves. The store and its customers are a demo with simulated traffic; the platform, the
          models, the approvals and the tracing are real.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Pillar title="Controlled" body="Registry, tool gateway and database roles: the dangerous action has no code path." />
          <Pillar title="Verified" body="Schema-checked outputs and deterministic guards before anything is proposed." />
          <Pillar title="Observable" body="Every step live on this dashboard, every call in Langfuse, every decision audited." />
        </div>
      </header>

      <Section title="Architecture" lead="One request path from the left, one decision path along the bottom, and observability under all of it.">
        <Card>
          <div className="p-4">
            <ArchitectureDiagram />
          </div>
        </Card>
      </Section>

      <Section title="The life of a ticket" lead="What happens between “my order arrived broken” and a refund, and where it lives in the code.">
        <ol className="relative space-y-6 border-l border-line pl-8">
          {LIFECYCLE.map((s, i) => (
            <li key={s.title} className="relative">
              <span className="absolute -left-[45px] grid h-7 w-7 place-items-center rounded-full border border-line-strong bg-panel text-xs font-semibold tabular-nums text-muted">
                {i + 1}
              </span>
              <h3 className="font-medium">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              <code className="mt-2 inline-block rounded bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-faint">{s.code}</code>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Governance in five layers"
        lead="Each layer assumes the one above it failed. The strongest is the database: a prompt can be talked around, a missing grant cannot."
      >
        <div className="space-y-2">
          {GOVERNANCE.map(([title, body], i) => (
            <div key={title} className="flex gap-4 rounded-xl border border-line bg-panel p-4" style={{ marginLeft: `${i * 12}px` }}>
              <span className="w-28 shrink-0 text-sm font-medium text-brand">{title}</span>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            ["0", "Read internal data", "agent"],
            ["1", "Draft for a human", "agent"],
            ["2", "Send to a customer", "human approves"],
            ["3", "Move money", "human approves, re-validated"],
          ].map(([tier, label, who]) => (
            <div key={tier} className="bg-panel p-4">
              <div className="text-xs text-faint">Tier {tier}</div>
              <div className="mt-1 text-sm font-medium">{label}</div>
              <div className="mt-0.5 text-xs text-faint">{who}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="When things go wrong" lead="Failures are expected and designed for. Try “simulate outage” on the top bar and watch the queue page.">
        <div className="grid gap-3 sm:grid-cols-2">
          {RELIABILITY.map(([title, body]) => (
            <div key={title} className="rounded-xl border border-line bg-panel p-4">
              <h3 className="text-sm font-medium">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
        <Card className="mt-4">
          <div className="p-5">
            <h3 className="text-sm font-medium">Circuit breaker, per provider</h3>
            <BreakerDiagram />
          </div>
        </Card>
      </Section>

      <Section title="Observability" lead="Three views of the same run, for three different questions.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Pillar title="This dashboard" body="Is the system healthy right now? Runs, queue, approvals and provider state, pushed live by Supabase Realtime." />
          <Pillar title="Langfuse" body="Why did this run do that? The full prompt, every tool call, tokens and cost, one trace per ticket." />
          <Pillar title="Audit log" body="Who decided what, and when? Agents' proposals, humans' decisions, blocks and dead letters." />
        </div>
      </Section>

      <Section title="Stack">
        <dl className="divide-y divide-line rounded-xl border border-line bg-panel">
          {STACK.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[8rem_1fr] gap-4 px-4 py-3 text-sm">
              <dt className="text-faint">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </article>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="mt-14">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {lead && <p className="mt-1.5 text-sm text-muted">{lead}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function BreakerDiagram() {
  const node = (x: number, label: string, sub: string, color: string) => (
    <g>
      <rect x={x} y="30" width="160" height="56" rx="28" fill="var(--panel-2)" stroke={color} />
      <text x={x + 80} y="55" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--ink)">{label}</text>
      <text x={x + 80} y="72" textAnchor="middle" fontSize="11" fill="var(--muted)">{sub}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 700 140" className="mt-3 w-full" role="img" aria-label="Circuit breaker states">
      <defs>
        <marker id="bh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M1 1L9 5L1 9" fill="none" stroke="color-mix(in srgb, var(--ink) 55%, transparent)" strokeWidth="1.5" />
        </marker>
      </defs>
      {node(20, "Closed", "calls go through", "var(--ok)")}
      {node(270, "Open", "calls skip it", "var(--bad)")}
      {node(520, "Half open", "one probe call", "var(--warn)")}
      <path d="M180 50 L268 50" stroke="color-mix(in srgb, var(--ink) 40%, transparent)" fill="none" markerEnd="url(#bh)" />
      <text x="224" y="42" textAnchor="middle" fontSize="11" fill="var(--muted)">3 failures</text>
      <path d="M430 50 L518 50" stroke="color-mix(in srgb, var(--ink) 40%, transparent)" fill="none" markerEnd="url(#bh)" />
      <text x="474" y="42" textAnchor="middle" fontSize="11" fill="var(--muted)">after 30s</text>
      <path d="M520 72 L432 72" stroke="color-mix(in srgb, var(--ink) 40%, transparent)" fill="none" markerEnd="url(#bh)" />
      <text x="476" y="90" textAnchor="middle" fontSize="11" fill="var(--muted)">probe fails</text>
      <path d="M600 86 C600 130, 100 130, 100 88" stroke="color-mix(in srgb, var(--ink) 40%, transparent)" fill="none" markerEnd="url(#bh)" />
      <text x="350" y="125" textAnchor="middle" fontSize="11" fill="var(--muted)">probe succeeds</text>
    </svg>
  );
}
