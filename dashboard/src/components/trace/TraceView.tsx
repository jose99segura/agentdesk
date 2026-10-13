"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLiveQuery } from "@/components/live";
import { clock, eur, ms, usd } from "@/lib/format";
import { supabase } from "@/lib/supabase";

// One ticket, start to finish: who touched it, in what order, how long each part took and
// what each agent saw and decided. Everything comes from rows the platform already writes
// (tickets, jobs, runs, run_steps, proposals) and updates live while the ticket moves.

type Ticket = {
  id: string; external_id: string; channel: string; customer_email: string; subject: string | null; body: string;
  language: string | null; intent: string | null; urgency: string | null; status: string; created_at: string;
};
type Job = { id: number; status: string; attempts: number; max_attempts: number; last_error: string | null; locked_by: string | null; created_at: string; updated_at: string };
type Run = {
  id: string; agent_id: string; status: string; provider: string | null; model: string | null; input_tokens: number;
  output_tokens: number; cost_usd: number; latency_ms: number | null; error: string | null; trace_url: string | null;
  started_at: string; ended_at: string | null;
};
type Step = { id: number; run_id: string; seq: number; kind: string; name: string; status: string; input: unknown; output: unknown; latency_ms: number | null; created_at: string };
type Proposal = {
  id: string; run_id: string; kind: "send_reply" | "refund"; tier: number; status: string; flags: string[];
  payload: { body?: string; order_id?: string; amount_cents?: number; reason?: string };
  decided_by: string | null; decided_at: string | null; executed_at: string | null; result: unknown;
  notified_at: string | null; notified_via: string | null; created_at: string;
};
type Data = { ticket: Ticket | null; jobs: Job[]; runs: Run[]; steps: Step[]; proposals: Proposal[] };

export type Prompts = Record<string, { system_prompt: string; tools: { name: string; description: string }[] } | undefined>;

async function load(id: string): Promise<Data> {
  const [t, j, r, p] = await Promise.all([
    supabase.from("tickets").select("*").eq("id", id).maybeSingle(),
    supabase.from("jobs").select("*").eq("ticket_id", id).order("id"),
    supabase.from("runs").select("*").eq("ticket_id", id).is("eval_run_id", null).order("started_at"),
    supabase.from("proposals").select("*").eq("ticket_id", id).order("created_at"),
  ]);
  const runs = (r.data as Run[]) ?? [];
  const s = runs.length
    ? await supabase.from("run_steps").select("*").in("run_id", runs.map((x) => x.id)).order("seq")
    : { data: [] };
  return { ticket: t.data as Ticket | null, jobs: (j.data as Job[]) ?? [], runs, steps: (s.data as Step[]) ?? [], proposals: (p.data as Proposal[]) ?? [] };
}

// ------------------------------------------------------------------- actors (lanes)

const ACTORS = {
  customer: { label: "Customer", short: "C", ring: "bg-zinc-500" },
  intake: { label: "Intake", short: "IN", ring: "bg-orange-500" },
  queue: { label: "Queue", short: "Q", ring: "bg-sky-500" },
  agent: { label: "Agent", short: "AI", ring: "bg-violet-500" },
  model: { label: "Model", short: "LLM", ring: "bg-indigo-500" },
  tool: { label: "Tool", short: "T", ring: "bg-teal-500" },
  guard: { label: "Guard", short: "G", ring: "bg-emerald-600" },
  human: { label: "Human", short: "H", ring: "bg-amber-500" },
  outcome: { label: "Outcome", short: "✓", ring: "bg-green-600" },
} as const;
type Actor = keyof typeof ACTORS;
type Tone = "ok" | "warn" | "bad" | "wait" | "info";

type Event = {
  key: string; actor: Actor; at: number; end?: number; title: string; sub?: string; tone: Tone;
  body?: ReactNode; indent?: boolean;
};

const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

function intakeOf(tk: Ticket): { via: string; path: string[] } {
  const ext = tk.external_id;
  if (ext.startsWith("n8n-")) return { via: "n8n", path: ["Store chat", "n8n · 01 intake webhook", "n8n · 00 create ticket", "POST /tickets"] };
  if (ext.startsWith("voice-")) return { via: "voice", path: ["Phone call", "ElevenLabs voice agent", "tool open_ticket", "POST /tickets"] };
  if (ext.startsWith("shop-")) return { via: "store", path: ["Store chat", "POST /tickets (n8n unavailable)"] };
  if (tk.channel === "form") return { via: "form", path: ["n8n · 02 contact form", "n8n · 00 create ticket", "POST /tickets"] };
  return { via: "api", path: [tk.channel, "POST /tickets"] };
}

function buildEvents(d: Data, prompts: Prompts): Event[] {
  const tk = d.ticket!;
  const ev: Event[] = [];
  const t0 = t(tk.created_at);
  const intake = intakeOf(tk);

  ev.push({
    key: "msg", actor: "customer", at: t0, tone: "info", title: `${tk.customer_email} writes on ${tk.channel}`,
    body: <Quote>{tk.body}</Quote>,
  });
  ev.push({
    key: "intake", actor: "intake", at: t0, tone: "ok", title: `Accepted through ${intake.via}`,
    sub: "One ticket per message: a redelivered webhook with the same id is ignored.",
    body: <Path steps={intake.path} extra={`idempotency key: ${tk.external_id}`} />,
  });

  const job = d.jobs[0];
  if (job) {
    const firstRun = d.runs[0];
    const waited = firstRun ? t(firstRun.started_at) - t(job.created_at) : NaN;
    ev.push({
      key: "queue", actor: "queue", at: t(job.created_at), end: firstRun ? t(firstRun.started_at) : undefined,
      tone: job.status === "dead" ? "bad" : firstRun ? "ok" : "wait",
      title: firstRun ? `Queued, picked up by a worker after ${ms(waited)}` : "Queued, waiting for a worker",
      sub: "Postgres job queue: claimed with FOR UPDATE SKIP LOCKED; Pub/Sub wakes the worker on Cloud Run.",
      body: (
        <KV rows={[
          ["job", `#${job.id} · ${job.status}`],
          ["attempts", `${job.attempts} of ${job.max_attempts}`],
          ["worker", job.locked_by ?? "—"],
          ...(job.last_error ? [["last error", job.last_error] as [string, string]] : []),
        ]} />
      ),
    });
  }

  for (const run of d.runs) {
    const p = prompts[run.agent_id];
    const start = t(run.started_at);
    const end = run.ended_at ? t(run.ended_at) : undefined;
    ev.push({
      key: `run-${run.id}`, actor: "agent", at: start, end,
      tone: run.status === "succeeded" ? "ok" : run.status === "failed" ? "bad" : "wait",
      title: `${run.agent_id === "triage" ? "Triage agent" : run.agent_id === "resolver" ? "Resolver agent" : run.agent_id} ${run.status === "running" ? "is working…" : run.status}`,
      sub: run.agent_id === "triage"
        ? "Reads the message and classifies it: intent, urgency, language. No tools."
        : run.agent_id === "resolver"
          ? "Looks up the customer's data through the tool gateway and proposes a reply, and a refund if it applies."
          : undefined,
      body: (
        <>
          <KV rows={[
            ["model", run.model ? `${run.provider}/${run.model}` : "—"],
            ["tokens", `${run.input_tokens} in · ${run.output_tokens} out`],
            ["cost", usd(run.cost_usd, 5)],
            ["took", ms(run.latency_ms)],
          ]} />
          {run.error && <p className="mt-2 rounded-md bg-bad/10 px-2 py-1 text-xs text-bad">{run.error}</p>}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {p && (
              <details>
                <summary className="cursor-pointer text-info">System prompt{p.tools.length ? ` and ${p.tools.length} tools` : ""}</summary>
                <pre className="mt-2 max-w-full whitespace-pre-wrap rounded-md bg-canvas p-3 font-mono text-[11px] text-muted">{p.system_prompt}</pre>
                {p.tools.length > 0 && (
                  <ul className="mt-2 space-y-1 text-muted">
                    {p.tools.map((x) => <li key={x.name}><span className="font-mono text-ink">{x.name}</span>: {x.description}</li>)}
                  </ul>
                )}
              </details>
            )}
            {run.trace_url && <a href={run.trace_url} target="_blank" rel="noreferrer" className="text-info hover:underline">Langfuse trace ↗</a>}
          </div>
        </>
      ),
    });
    if (run.agent_id === "triage" && run.status === "succeeded" && tk.intent) {
      ev.push({
        key: `triage-out-${run.id}`, actor: "agent", at: end ?? start, tone: "ok", indent: true,
        title: `Classified as ${tk.intent.replaceAll("_", " ")}`,
        body: <KV rows={[["urgency", tk.urgency ?? "—"], ["language", tk.language ?? "—"]]} />,
      });
    }
    for (const s of d.steps.filter((x) => x.run_id === run.id)) {
      const sEnd = t(s.created_at);
      const sStart = s.latency_ms ? sEnd - s.latency_ms : sEnd;
      const tone: Tone = s.status === "ok" ? (s.kind === "fallback" ? "warn" : "ok") : s.status === "blocked" ? "warn" : "bad";
      const out = s.output as Record<string, unknown> | null;
      if (s.kind === "llm") {
        ev.push({
          key: `s-${s.id}`, actor: "model", at: sStart, end: sEnd, tone, indent: true,
          title: `${s.name.split("/").pop()} ${decided(out?.response)}`,
          sub: out ? `${out.tokens_in} tokens in · ${out.tokens_out} out · ${usd(out.cost_usd as number, 5)} · ${ms(s.latency_ms)}` : undefined,
          body: <Json label="What the model answered" value={out?.response} />,
        });
      } else if (s.kind === "tool") {
        ev.push({
          key: `s-${s.id}`, actor: "tool", at: sStart, end: sEnd, tone, indent: true,
          title: s.status === "blocked" ? `Tool ${s.name} refused by the gateway` : `Tool ${s.name}${argsLabel(s.input)}`,
          sub: s.status === "blocked" ? "Not granted to this agent: refused and logged." : "Runs on the read-only desk_agent role, bound to the ticket's sender.",
          body: <Json label="Result" value={s.output} />,
        });
      } else if (s.kind === "guard") {
        ev.push({
          key: `s-${s.id}`, actor: "guard", at: sStart, end: sEnd, tone, indent: true,
          title: s.status === "ok" ? `Guard passed: ${s.name}` : s.status === "blocked" ? `Guard blocked: ${s.name}` : `Guard failed: ${s.name}`,
          sub: "Checks the draft against what the tools returned: real orders, refund limits, leaked data, promises, injected instructions.",
          body: <Json label="Checks" value={s.output} />,
        });
      } else {
        ev.push({
          key: `s-${s.id}`, actor: "model", at: sStart, end: sEnd, tone, indent: true,
          title: s.kind === "fallback" ? `Fallback: ${s.name}` : s.kind === "retry" ? `Retry: ${s.name}` : `Error: ${s.name}`,
          sub: s.kind === "fallback" ? "The model router moved to the next provider." : s.kind === "retry" ? "The call failed and was retried with backoff." : undefined,
          body: <Json label="Detail" value={s.output} />,
        });
      }
    }
  }

  for (const p of d.proposals) {
    const what = p.kind === "refund" ? `Refund of ${eur(p.payload.amount_cents)} on ${p.payload.order_id}` : "Reply to the customer";
    ev.push({
      key: `p-${p.id}`, actor: "agent", at: t(p.created_at), tone: "info",
      title: `Proposes: ${what}`,
      sub: `Risk tier ${p.tier}: ${p.kind === "refund" ? "moves money" : "sends to a customer"}, so nothing happens until a person approves.`,
      body: (
        <>
          {p.payload.body && <Quote>{p.payload.body}</Quote>}
          {p.payload.reason && <p className="mt-1 text-xs text-muted">Reason: {p.payload.reason}</p>}
          {p.flags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {p.flags.map((f) => <span key={f} className="rounded bg-warn/10 px-1.5 py-0.5 text-[11px] text-warn">flag: {f.replaceAll("_", " ")}</span>)}
            </div>
          )}
        </>
      ),
    });
    if (p.notified_at) {
      ev.push({
        key: `n-${p.id}`, actor: "human", at: t(p.notified_at), tone: "ok", indent: true,
        title: `${p.notified_via === "digest" ? "Bundled into a Telegram digest" : "Telegram card sent to the reviewer"}: ${p.kind === "refund" ? "the refund" : "the reply"}`,
        sub: "Approve and Reject buttons; the press goes through the same checks as the dashboard.",
      });
    }
    if (p.decided_at) {
      const approved = p.status === "approved" || p.status === "executed";
      ev.push({
        key: `d-${p.id}`, actor: "human", at: t(p.decided_at), tone: approved ? "ok" : p.status === "failed" ? "bad" : "warn",
        title: `${p.kind === "refund" ? "Refund" : "Reply"} ${approved ? "approved" : p.status === "failed" ? "failed re-validation" : "rejected"} by ${p.decided_by ?? "a person"}`,
        sub: `${ms(t(p.decided_at) - t(p.created_at))} after it was proposed. Approval re-checks everything against the database.`,
      });
    } else {
      ev.push({
        key: `w-${p.id}`, actor: "human", at: t(p.created_at), tone: "wait", indent: true,
        title: `Waiting for a person to decide on ${p.kind === "refund" ? "the refund" : "the reply"}`,
      });
    }
    if (p.executed_at) {
      ev.push({
        key: `x-${p.id}`, actor: "outcome", at: t(p.executed_at), tone: "ok",
        title: p.kind === "refund" ? `Refund executed: ${eur(p.payload.amount_cents)}` : "Reply delivered to the customer",
        sub: p.kind === "refund" ? "Written by the API role; the agent role has no grant to do it." : "It now shows in the store's chat. Audit log entry written.",
      });
    }
  }

  if (["needs_human", "failed"].includes(tk.status) && !d.proposals.length) {
    ev.push({
      key: "handoff", actor: "outcome", at: d.runs.length ? t(d.runs[d.runs.length - 1].ended_at) || t0 : t0, tone: "warn",
      title: tk.status === "needs_human" ? "Handed to a person" : "Failed",
      sub: "No proposal: a guard blocked the draft or the agents could not finish. Nothing was sent.",
    });
  }
  return ev.sort((a, b) => a.at - b.at || Number(!!a.indent) - Number(!!b.indent));
}

// What a model call decided, in words: the tools it chose, or the structured answer it gave.
function decided(response: unknown): string {
  if (Array.isArray(response) && response.length) {
    const calls = response as { name?: string; arguments?: Record<string, unknown> }[];
    if (calls.some((c) => c.name === "submit_resolution")) return "writes the reply and the decision";
    return `decides to call ${calls.map((c) => `${c.name}${argsLabel(c.arguments)}`).join(", ")}`;
  }
  if (response && typeof response === "object" && "intent" in response) return "returns the classification";
  return "answers";
}

function argsLabel(input: unknown) {
  if (!input || typeof input !== "object") return "";
  const vals = Object.values(input as Record<string, unknown>).filter((v) => typeof v === "string" || typeof v === "number");
  return vals.length ? `(${vals.join(", ")})` : "()";
}

// ------------------------------------------------------------------- stages

function stages(d: Data) {
  const tk = d.ticket!;
  const triage = d.runs.find((r) => r.agent_id === "triage");
  const resolver = d.runs.find((r) => r.agent_id === "resolver");
  const guards = d.steps.filter((s) => s.kind === "guard");
  const decided = d.proposals.length > 0 && d.proposals.every((p) => p.decided_at);
  const delivered = d.proposals.some((p) => p.kind === "send_reply" && p.executed_at);
  const st = (done: boolean, active: boolean, bad = false) => (bad ? "bad" : done ? "done" : active ? "active" : "todo");
  return [
    { label: "Received", state: "done" },
    { label: "Queued", state: st(!!triage, !triage, d.jobs[0]?.status === "dead") },
    { label: "Triage", state: st(triage?.status === "succeeded", triage?.status === "running", triage?.status === "failed") },
    { label: "Resolver", state: st(resolver?.status === "succeeded", resolver?.status === "running", resolver?.status === "failed") },
    { label: "Guards", state: st(guards.length > 0 && guards.every((g) => g.status === "ok"), false, guards.some((g) => g.status === "blocked")) },
    { label: "Human", state: st(decided, d.proposals.length > 0 && !decided, tk.status === "needs_human" && !d.proposals.length) },
    { label: "Delivered", state: st(delivered, false) },
  ] as { label: string; state: "done" | "active" | "todo" | "bad" }[];
}

// ------------------------------------------------------------------- view

export default function TraceView({ id, prompts }: { id: string; prompts: Prompts }) {
  const d = useLiveQuery(() => load(id), null as Data | null, [id]);
  if (!d) return <p className="text-sm text-faint">Loading…</p>;
  if (!d.ticket) return <p className="text-sm text-faint">No ticket with this id. <Link href="/trace" className="text-info">Back to all messages</Link></p>;

  const events = buildEvents(d, prompts);
  const t0 = t(d.ticket.created_at);
  const last = Math.max(...events.map((e) => e.end ?? e.at).filter((x) => !Number.isNaN(x)));
  const cost = d.runs.reduce((a, r) => a + Number(r.cost_usd), 0);
  const tokens = d.runs.reduce((a, r) => a + r.input_tokens + r.output_tokens, 0);
  const machine = d.runs.length ? Math.max(...d.runs.map((r) => t(r.ended_at ?? r.started_at))) - t0 : 0;

  return (
    <div className="space-y-6">
      <Stepper items={stages(d)} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Machine time" value={ms(machine)} hint="message to proposals" />
        <Fact label="Total so far" value={ms(last - t0)} hint="including the human" />
        <Fact label="Model cost" value={usd(cost, 4)} hint={`${tokens} tokens`} />
        <Fact label="Agents · tool calls" value={`${d.runs.length} · ${d.steps.filter((s) => s.kind === "tool").length}`} hint={`${d.steps.filter((s) => s.kind === "llm").length} model calls`} />
      </div>
      <Gantt d={d} t0={t0} last={last} />
      <section>
        <h2 className="mb-3 text-sm font-medium">Step by step</h2>
        <ol className="relative space-y-3">
          <span className="absolute bottom-2 left-[15px] top-2 w-px bg-line" />
          {events.map((e) => <EventRow key={e.key} e={e} t0={t0} />)}
        </ol>
      </section>
    </div>
  );
}

function Stepper({ items }: { items: ReturnType<typeof stages> }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {items.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              s.state === "done" ? "border-ok/30 bg-ok/10 text-ok"
                : s.state === "active" ? "animate-pulse border-warn/40 bg-warn/10 text-warn"
                  : s.state === "bad" ? "border-bad/30 bg-bad/10 text-bad"
                    : "border-line text-faint"
            }`}
          >
            {s.state === "done" ? "✓" : s.state === "bad" ? "✕" : s.state === "active" ? "●" : "○"} {s.label}
          </span>
          {i < items.length - 1 && <span className="text-faint">→</span>}
        </li>
      ))}
    </ol>
  );
}

function Gantt({ d, t0, last }: { d: Data; t0: number; last: number }) {
  const span = Math.max(last - t0, 1);
  const bars: { label: string; from: number; to: number; color: string }[] = [];
  const firstRun = d.runs[0];
  if (d.jobs[0]) bars.push({ label: "queue", from: t(d.jobs[0].created_at), to: firstRun ? t(firstRun.started_at) : last, color: "bg-sky-500" });
  for (const r of d.runs) bars.push({ label: r.agent_id, from: t(r.started_at), to: r.ended_at ? t(r.ended_at) : last, color: "bg-violet-500" });
  for (const p of d.proposals.filter((x) => x.kind === "send_reply")) {
    bars.push({ label: "waiting for human", from: t(p.created_at), to: p.decided_at ? t(p.decided_at) : last, color: "bg-amber-500" });
  }
  if (!bars.length) return null;
  return (
    <section className="rounded-xl border border-line bg-panel p-4">
      <div className="mb-2 flex justify-between text-[11px] text-faint">
        <span>Where the time went</span>
        <span>0s → {ms(span)}</span>
      </div>
      <div className="space-y-1.5">
        {bars.map((b, i) => (
          <div key={i} className="grid grid-cols-[110px_1fr] items-center gap-2 text-[11px]">
            <span className="truncate text-muted">{b.label}</span>
            <div className="relative h-3 rounded bg-ink/[0.04]">
              <div
                className={`absolute h-3 rounded ${b.color}`}
                style={{ left: `${((b.from - t0) / span) * 100}%`, width: `${Math.max(((b.to - b.from) / span) * 100, 0.8)}%` }}
                title={ms(b.to - b.from)}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const TONE: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", wait: "text-warn", info: "text-info" };

function EventRow({ e, t0 }: { e: Event; t0: number }) {
  const a = ACTORS[e.actor];
  return (
    <li className={`relative flex gap-3 ${e.indent ? "pl-6" : ""}`}>
      <span className={`relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${a.ring} ${e.tone === "wait" ? "animate-pulse" : ""}`}>
        {a.short}
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3.5 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-faint">{a.label}</span>
          <span className={`text-sm font-medium ${TONE[e.tone]}`}>{e.title}</span>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-faint" title={clock(new Date(e.at).toISOString())}>
            +{ms(Math.max(0, e.at - t0))}{e.end && e.end - e.at > 0 ? ` · ${ms(e.end - e.at)}` : ""}
          </span>
        </div>
        {e.sub && <p className="mt-0.5 text-xs text-muted">{e.sub}</p>}
        {e.body && <div className="mt-2">{e.body}</div>}
      </div>
    </li>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3.5 py-2.5">
      <div className="text-[11px] text-faint">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-faint">{hint}</div>
    </div>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return <p className="whitespace-pre-wrap rounded-lg border-l-2 border-line-strong bg-canvas px-3 py-2 text-sm">{children}</p>;
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-faint">{k}</dt>
          <dd className="break-all font-mono text-muted">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Path({ steps, extra }: { steps: string[]; extra: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {steps.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="rounded-md bg-orange-500/10 px-2 py-0.5 text-orange-600">{s}</span>
            {i < steps.length - 1 && <span className="text-faint">→</span>}
          </span>
        ))}
      </div>
      <p className="font-mono text-[11px] text-faint">{extra}</p>
    </div>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-info">{label}</summary>
      <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-canvas p-3 font-mono text-[11px] text-muted">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
