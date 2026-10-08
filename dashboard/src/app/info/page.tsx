import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import BreakerDiagram from "@/components/info/BreakerDiagram";
import Evaluations from "@/components/info/Evaluations";
import Failures from "@/components/info/Failures";
import Glossary from "@/components/info/Glossary";
import LangfuseTour from "@/components/info/LangfuseTour";
import N8nWorkflows from "@/components/info/N8nWorkflows";
import { Card3, Code, Section, Sub } from "@/components/info/parts";
import Prompts from "@/components/info/Prompts";
import Toc from "@/components/info/Toc";

export const metadata: Metadata = { title: "How it works" };

const TOC = [
  { id: "overview", label: "What it is" },
  { id: "tour", label: "A two-minute tour" },
  { id: "architecture", label: "Architecture" },
  { id: "ticket", label: "The life of a ticket" },
  { id: "n8n", label: "Channels in n8n" },
  { id: "agents", label: "Agents, prompts, tools" },
  { id: "governance", label: "Governance" },
  { id: "evals", label: "Evaluations" },
  { id: "langfuse", label: "Tracing in Langfuse" },
  { id: "failures", label: "When things go wrong" },
  { id: "glossary", label: "Glossary" },
  { id: "code", label: "Stack and code map" },
];

const TOUR = [
  ["Overview", "/", "Is it healthy? Tickets, success rate, latency, cost, and what is waiting for you."],
  ["Runs", "/runs", "Open any run to see each step, then jump to its full trace in Langfuse."],
  ["Approvals", "/approvals", "Approve a refund. It runs only now, after a re-check, and lands in the audit log."],
  ["Top bar", "/", "“simulate outage” on a provider: watch retries, fallback and the circuit breaker."],
  ["Queue", "/queue", "Jobs out of retries wait here with a Retry button instead of being lost."],
  ["Agents", "/agents", "The registry: who owns each agent, its risk tier, the exact tools it may call."],
  ["Evals", "/evals", "The golden suite, case by case, and whether the gate is open."],
  ["Audit log", "/audit", "Who decided what, and when: agents, people, the system."],
] as const;

const LIFECYCLE = [
  ["A message arrives", "From the n8n contact form or webhook (or the simulator), the API receives it. The sender's message id makes a redelivered webhook a no-op; the ticket and its job are written in one transaction.", "api.py · POST /tickets"],
  ["It waits in a durable queue", "A Postgres table, not a separate broker. Workers claim jobs with FOR UPDATE SKIP LOCKED, are woken instantly by LISTEN/NOTIFY, and hold a lease so a crashed worker's job is picked up again.", "jobs.py · claim()"],
  ["Triage classifies it", "A tier 0 agent with no tools returns intent, language and urgency as a schema-checked tool call. A malformed answer gets one repair turn; a second failure fails the attempt and the queue retries it later.", "agents/runner.py · run_triage()"],
  ["The resolver looks things up", "A tier 1 agent alternates model calls and tool calls. The gateway offers it three read-only tools, always scoped to the ticket's sender, so it cannot read another customer's orders.", "gateway.py · Gateway.call()"],
  ["Guards check the draft", "Order ids it never looked up, refunds above what is left on the order or on another customer's order, and leaked emails block the run. Promises and prompt injection are flagged for the reviewer.", "guards.py · check_resolution()"],
  ["Effects become proposals", "A reply (tier 2) and maybe a refund (tier 3) are written as pending proposals, together with the ticket status and an audit entry, in one transaction: all or nothing.", "pipeline.py · process_ticket()"],
  ["A person decides", "On the dashboard or with a button in Telegram. Both use the same executor, which locks the proposal, re-checks the refund against the order and ignores a second click.", "approvals.py · decide()"],
  ["Everything is on the record", "Each run and step is in the database as it happens (that is what the dashboard shows live), each model and tool call is in Langfuse, and each decision is in the audit log.", "recorder.py · RunRecorder"],
];

const GOVERNANCE = [
  ["Registry", "An agent runs only with a registered owner, risk tier and tool grant. Remove the row and it stops."],
  ["Tool gateway", "The model is offered only its granted tools; anything else is refused and logged as a blocked step."],
  ["Database roles", "Agents connect as desk_agent, which has no permission on refunds, outgoing messages or decisions. The forbidden write has no code path, and a test proves the database refuses it."],
  ["Guards", "Deterministic checks on the output, against the database rather than against what the model claims it saw."],
  ["Human approval", "The only path that refunds or sends. Re-validates, locks the row, records who decided."],
];

const CODE = [
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

const STACK = [
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

export default function InfoPage() {
  return (
    <div className="flex gap-12">
      <article className="min-w-0 max-w-3xl flex-1 space-y-16">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">How it works</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Agents that do the work, people who make the calls</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            A complete, explained walk through agentdesk: what it does, how a ticket moves through it, how the agents are
            controlled and tested, and how you can see every step.
          </p>
        </header>

        <Section
          id="overview"
          number="01"
          title="What it is"
          lead="A team of AI agents that handles customer support for an online store."
          plain={
            <>
              Customers write in by email, chat or a contact form. The agents read each message, look up the customer and the
              order, and write a reply, and sometimes suggest a refund. They are not allowed to send anything or give money back
              on their own: those actions wait for a person to press Approve. Everything they do is visible live on this
              dashboard and recorded step by step.
            </>
          }
        >
          <Card3
            items={[
              ["Controlled", "Each agent can only use the tools it was given, and its database login cannot refund or send at all."],
              ["Verified", "Every answer is checked by rules before a person sees it, and a test suite of known tickets runs on every change."],
              ["Observable", "Every step is live on this dashboard, every model call is in Langfuse, every decision is in the audit log."],
            ]}
          />
          <p className="text-sm leading-relaxed text-muted">
            The store and its customers are a demo with simulated traffic. Everything else is real: the queue, the models, the
            rules, the approvals from a phone, the tracing and the evaluation that guards every change.
          </p>
        </Section>

        <Section id="tour" number="02" title="A two-minute tour" lead="Where to click, in order, to see the whole system work.">
          <ol className="grid gap-2 sm:grid-cols-2">
            {TOUR.map(([name, href, what], i) => (
              <li key={name}>
                <Link href={href} className="flex h-full gap-3 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong">
                  <span className="font-mono text-xs text-faint">{i + 1}</span>
                  <span>
                    <span className="text-sm font-semibold">{name}</span>
                    <span className="mt-0.5 block text-sm text-muted">{what}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="architecture"
          number="03"
          title="Architecture"
          lead="One request path from left to right, one decision path along the bottom, and observability under all of it."
          plain={
            <>
              Messages come in on the left and wait in line. A worker hands each one to two agents: the first sorts it, the
              second looks things up and drafts an answer. Purple boxes are the safety rules; the amber box is you. Nothing
              reaches the store on the bottom row without passing through you.
            </>
          }
        >
          <div className="rounded-xl border border-line bg-panel p-4">
            <ArchitectureDiagram />
          </div>
        </Section>

        <Section
          id="ticket"
          number="04"
          title="The life of a ticket"
          lead="What happens between “my order arrived broken” and a refund, and where each step lives in the code."
        >
          <ol className="relative space-y-6 border-l border-line pl-8">
            {LIFECYCLE.map(([title, body, code], i) => (
              <li key={title} className="relative">
                <span className="absolute -left-[45px] grid h-7 w-7 place-items-center rounded-full border border-line-strong bg-panel text-xs font-semibold tabular-nums text-muted">
                  {i + 1}
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
                <span className="mt-2 inline-block">
                  <Code>{code}</Code>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="n8n"
          number="05"
          title="Channels in n8n"
          lead="n8n owns the edges: how customers reach the platform, the traffic that keeps the demo alive, the morning report and the alarms."
          plain={
            <>
              n8n is a visual automation tool: each box is a step, each line is where the data goes next. It handles the
              outside world (forms, webhooks, schedules, Telegram), and hands the actual work to the platform through its API.
              The agents, their rules and their retries stay in the platform, not in n8n.
            </>
          }
        >
          <N8nWorkflows />
        </Section>

        <Section
          id="agents"
          number="06"
          title="Agents, prompts and tools"
          lead="Exactly what each agent receives, served live by the core API from the code that runs: the system prompt, the shape of the message, and the schema of every tool."
          plain={
            <>
              A prompt is the instruction sheet an agent reads before each ticket. Tools are the only things it can do: look up
              the customer, list their orders, open one order. It answers by filling in a form (a JSON schema) rather than writing
              free text, so the platform can check every field before anyone sees it.
            </>
          }
        >
          <Suspense fallback={<p className="text-sm text-faint">Loading the live prompts…</p>}>
            <Prompts />
          </Suspense>
        </Section>

        <Section
          id="governance"
          number="07"
          title="Governance"
          lead="Five layers, each assuming the one above it failed. The strongest is the database: a prompt can be talked around, a missing permission cannot."
          plain={
            <>
              Telling a model “never refund without approval” is a request, not a guarantee. Here the agents&apos; database login
              simply has no permission to refund, so it cannot happen, whatever the model is tricked into trying.
            </>
          }
        >
          <div className="space-y-2">
            {GOVERNANCE.map(([title, body], i) => (
              <div key={title} className="flex gap-4 rounded-xl border border-line bg-panel p-4" style={{ marginLeft: `${i * 12}px` }}>
                <span className="w-28 shrink-0 text-sm font-semibold text-brand">{title}</span>
                <p className="text-sm leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {[
              ["0", "Read internal data", "agent"],
              ["1", "Draft for a person", "agent"],
              ["2", "Send to a customer", "a person approves"],
              ["3", "Move money", "a person approves, re-checked"],
            ].map(([tier, label, who]) => (
              <div key={tier} className="bg-panel p-4">
                <div className="text-xs text-faint">Tier {tier}</div>
                <div className="mt-1 text-sm font-semibold">{label}</div>
                <div className="mt-0.5 text-xs text-faint">{who}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="evals"
          number="08"
          title="Evaluations"
          lead="How we know the agents still behave after any change: tickets with known right answers, run through the real system, scored, and enforced in CI."
          plain={
            <>
              Like an exam with an answer key. Twelve customer messages whose right handling we know in advance, including
              six traps (another customer&apos;s order, a hidden “ignore your instructions”, an inflated refund). Every change to the
              code or a prompt has to pass the exam before it can go live.
            </>
          }
        >
          <Suspense fallback={<p className="text-sm text-faint">Loading the suite…</p>}>
            <Evaluations />
          </Suspense>
        </Section>

        <Section
          id="langfuse"
          number="09"
          title="Tracing in Langfuse"
          lead="Langfuse records what the agents actually did, call by call, so any reply can be explained after the fact."
          plain={
            <>
              The dashboard tells you <em>that</em> something happened; Langfuse tells you <em>why</em>. For any ticket you can
              read exactly what the model was told, what it looked up, what it answered and what it cost.
            </>
          }
        >
          <LangfuseTour />
        </Section>

        <Section
          id="failures"
          number="10"
          title="When things go wrong"
          lead="Failures are expected and designed for, in the order a ticket meets them. Try “simulate outage” on the top bar, then watch Runs and Queue."
          plain={
            <>
              Models time out, services go down, workers crash, people click twice. For each of these the system has a planned
              reaction, and each one is visible somewhere you can check.
            </>
          }
        >
          <Failures />
          <div className="rounded-xl border border-line bg-panel p-5">
            <h3 className="text-sm font-semibold">Circuit breaker, per model provider</h3>
            <BreakerDiagram />
          </div>
        </Section>

        <Section id="glossary" number="11" title="Glossary" lead="The terms used on this page, in one line each.">
          <Glossary />
        </Section>

        <Section id="code" number="12" title="Stack and code map" lead="What it is built with, and where each idea lives in the repository.">
          <dl className="divide-y divide-line rounded-xl border border-line bg-panel">
            {STACK.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[7rem_1fr] gap-4 px-4 py-3 text-sm">
                <dt className="text-faint">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <Sub title="Code map">
            <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
              {CODE.map(([path, what]) => (
                <li key={path} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[17rem_1fr] sm:gap-4">
                  <span className="font-mono text-xs text-ink">{path}</span>
                  <span className="text-sm text-muted">{what}</span>
                </li>
              ))}
            </ul>
          </Sub>
        </Section>
      </article>
      <Toc items={TOC} />
    </div>
  );
}
