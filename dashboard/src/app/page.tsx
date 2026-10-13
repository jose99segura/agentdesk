import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = { title: { absolute: "agentdesk · governed AI support agents" } };

// The front door: what this is in one sentence, how to see it work in three steps, and where
// to go next. Everything a first-time visitor needs before the control room makes sense.

const REPO = "https://github.com/jose99segura/agentdesk";

const FLOW = ["Customer", "n8n intake", "API", "Queue", "Triage agent", "Resolver agent + tools", "Guards", "Human approval", "Reply"];

export default function Start() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand/15 text-sm font-bold text-brand">a</span>
          <span className="font-semibold tracking-tight">agentdesk</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <Link href="/overview" className="hidden hover:text-ink sm:inline">Control room</Link>
          <Link href="/info" className="hidden hover:text-ink sm:inline">How it works</Link>
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-ink">GitHub ↗</a>
          <ThemeToggle />
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-8">
        <section className="pb-10 pt-8 sm:pt-14">
          <p className="text-sm font-medium text-brand">Governed AI agents for customer support</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            AI agents answer the customer. None of them can refund or reply without a person saying yes.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted">
            A support team of agents for an online store: they read the message, look up the order, draft the reply and
            propose a refund. A person approves, and everything they did is traced. The store is a demo; the platform
            underneath is real and running on Google Cloud.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/shop?as=eval.bruno%40example.com#help-ORD-90003" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-canvas hover:opacity-90">
              Try it in the demo store →
            </Link>
            <Link href="/info" className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium hover:bg-ink/5">
              How it works
            </Link>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">See it work in three steps</h2>
          <p className="mt-1 text-sm text-muted">About two minutes. You play both the customer and the person who approves.</p>
          <ol className="mt-5 grid gap-4 md:grid-cols-3">
            <Step
              n={1}
              title="Write as a customer"
              href="/shop?as=eval.bruno%40example.com#help-ORD-90003"
              cta="Open the store"
            >
              The store opens as Bruno with the chat on his order ORD-90003. Press <b>It arrived broken</b>, or write
              anything, in any language. Prefer to talk? Press <b>Call support</b> for the voice agent.
            </Step>
            <Step n={2} title="Approve as the reviewer" cta="">
              In seconds the agents look up the order and propose a reply and a refund of €129. Nothing happens until you
              press <b>Approve</b> in the chat. Then the reply arrives and the refund is executed.
            </Step>
            <Step n={3} title="Watch what happened" href="/trace" cta="Open the traces">
              Every message links to its trace: the intake, the queue, each agent, every model and tool call with its
              result, the guards, the decision, with timings and cost.
            </Step>
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="text-lg font-semibold">The path of one message</h2>
          <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
            {FLOW.map((f, i) => (
              <span key={f} className="flex items-center gap-1.5">
                <span className={`rounded-full border px-3 py-1 ${f === "Human approval" ? "border-warn/40 bg-warn/10 text-warn" : "border-line bg-panel"}`}>{f}</span>
                {i < FLOW.length - 1 && <span className="text-faint">→</span>}
              </span>
            ))}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <Fact title="Controlled">
              Agents run on a database role with no grant to refund or send: the dangerous write is impossible, not just
              discouraged. Guards check every draft against what the tools returned.
            </Fact>
            <Fact title="Resilient">
              A durable Postgres queue with retries and a dead letter queue. Model calls retry, fall back from Mistral to
              Claude and trip a circuit breaker.
            </Fact>
            <Fact title="Measured">
              Every call is traced in Langfuse with tokens and cost. A golden suite with safety traps gates every change in
              CI.
            </Fact>
          </div>
        </section>

        <section className="mt-14 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-5">
            <h2 className="font-semibold">Explore further</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <More href="/overview" label="Control room">Live runs, approvals, queue, agents, evals and audit log.</More>
              <More href="/info" label="How it works">Seven tabs of diagrams, prompts, worked paths and failure handling, plus a chat that answers questions about the system.</More>
              <More href="/trace" label="Traces">Any message, end to end.</More>
              <More href={REPO} label="Source code" external>Python core, Next.js dashboard, Terraform, n8n workflows, evaluations.</More>
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-panel p-5">
            <h2 className="font-semibold">What is real and what is not</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-ok">Real</dt>
                <dd className="text-muted">
                  The agents and their model calls (Mistral), the queue, tools, guards and approvals, n8n workflows,
                  Telegram cards, the ElevenLabs voice agent, Langfuse traces, Google Cloud (Cloud Run, Pub/Sub,
                  Scheduler, Terraform) and Supabase.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-warn">Demo</dt>
                <dd className="text-muted">
                  The store, its three customers, their orders and the money. <b>Reset demo</b> in the store undoes the
                  refunds visitors approved.
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-faint sm:px-8">
          <span>Built by José Luis Segura as a portfolio project.</span>
          <span className="flex gap-4">
            <a href="https://www.linkedin.com/in/jose99segura" target="_blank" rel="noreferrer" className="hover:text-ink">LinkedIn ↗</a>
            <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-ink">GitHub ↗</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, href, cta, children }: { n: number; title: string; href?: string; cta: string; children: ReactNode }) {
  return (
    <li className="flex flex-col rounded-xl border border-line bg-panel p-5">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/15 text-sm font-semibold text-brand">{n}</span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm text-muted">{children}</p>
      {href && cta && (
        <Link href={href} className="mt-4 self-start rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-ink/5">
          {cta} →
        </Link>
      )}
    </li>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}

function More({ href, label, external, children }: { href: string; label: string; external?: boolean; children: ReactNode }) {
  const cls = "font-medium text-info hover:underline";
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>{label} ↗</a>
      ) : (
        <Link href={href} className={cls}>{label}</Link>
      )}
      <span className="text-muted"> · {children}</span>
    </li>
  );
}
