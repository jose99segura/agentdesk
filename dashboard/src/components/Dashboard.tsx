"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { decideProposal, retryDeadJob, setChaos } from "@/app/actions";
import {
  supabase,
  type AuditEntry,
  type Chaos,
  type DeadJob,
  type Health,
  type Kpis,
  type Proposal,
  type Run,
  type Step,
} from "@/lib/supabase";

type Snapshot = {
  kpis: Kpis | null;
  runs: Run[];
  proposals: Proposal[];
  dead: DeadJob[];
  health: Health[];
  chaos: Chaos[];
  audit: AuditEntry[];
};

const EMPTY: Snapshot = { kpis: null, runs: [], proposals: [], dead: [], health: [], chaos: [], audit: [] };
const LIVE_TABLES = ["tickets", "jobs", "runs", "run_steps", "proposals", "provider_health", "chaos"];

async function loadSnapshot(): Promise<Snapshot> {
  const [kpis, runs, proposals, dead, health, chaos, audit] = await Promise.all([
    supabase.from("dashboard_kpis").select("*").single(),
    supabase
      .from("runs")
      .select("*, tickets(subject, channel, intent)")
      .order("started_at", { ascending: false })
      .limit(30),
    supabase
      .from("proposals")
      .select("*, tickets(customer_email, channel, body, language)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(20),
    supabase.from("jobs").select("id, attempts, last_error, updated_at").eq("status", "dead").limit(20),
    supabase.from("provider_health").select("*").order("provider"),
    supabase.from("chaos").select("provider, fail").order("provider"),
    supabase.from("audit_log").select("id, at, actor, action, subject").order("id", { ascending: false }).limit(12),
  ]);
  return {
    kpis: (kpis.data as Kpis) ?? null,
    runs: (runs.data as Run[]) ?? [],
    proposals: (proposals.data as Proposal[]) ?? [],
    dead: (dead.data as DeadJob[]) ?? [],
    health: (health.data as Health[]) ?? [],
    chaos: (chaos.data as Chaos[]) ?? [],
    audit: (audit.data as AuditEntry[]) ?? [],
  };
}

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnap(await loadSnapshot());
      setError(null);
    } catch {
      setError("Cannot reach the database.");
    }
  }, []);

  // Coalesce bursts of change events into one reload.
  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 250);
  }, [refresh]);

  useEffect(() => {
    scheduleRefresh();
    const channel = supabase.channel("live");
    for (const table of LIVE_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
    }
    channel.subscribe((status) => setLive(status === "SUBSCRIBED"));
    // KPIs are 24h windows: refresh them even when nothing happens.
    const interval = setInterval(refresh, 15_000);
    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [refresh, scheduleRefresh]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <Header live={live} health={snap.health} chaos={snap.chaos} />
      {error && <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      <KpiGrid k={snap.kpis} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <RunFeed runs={snap.runs} />
        <div className="flex flex-col gap-6">
          <Approvals proposals={snap.proposals} />
          <DeadLetters jobs={snap.dead} />
          <Audit entries={snap.audit} />
        </div>
      </div>
    </div>
  );
}

function Header({ live, health, chaos }: { live: boolean; health: Health[]; chaos: Chaos[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const failing = new Set(chaos.filter((c) => c.fail).map((c) => c.provider));
  const providers = health.length ? health : chaos.map((c) => ({ provider: c.provider, state: "closed" }) as Health);

  return (
    <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`} />
          {live ? "Live" : "Connecting"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">agentdesk</h1>
        <p className="text-sm text-zinc-400">Support agents, queued, verified and approved by a human.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {providers.map((h) => (
          <div key={h.provider} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${stateColor(h.state)}`} />
              <span className="font-medium">{h.provider}</span>
              <span className="text-zinc-500">{stateLabel(h.state)}</span>
            </div>
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setChaos(h.provider, !failing.has(h.provider));
                  setMsg(r.ok ? null : r.error);
                })
              }
              className="mt-1.5 text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-100 hover:underline disabled:opacity-50"
            >
              {failing.has(h.provider) ? "Restore provider" : "Simulate outage"}
            </button>
          </div>
        ))}
        {msg && <p className="w-full text-xs text-amber-300">{msg}</p>}
      </div>
    </header>
  );
}

function stateColor(state: string) {
  return state === "closed" ? "bg-emerald-400" : state === "half_open" ? "bg-amber-400" : "bg-red-500";
}

function stateLabel(state: string) {
  return state === "closed" ? "healthy" : state === "half_open" ? "probing" : "circuit open";
}

function KpiGrid({ k }: { k: Kpis | null }) {
  const runs = k ? k.runs_ok_24h + k.runs_failed_24h : 0;
  const rate = k && runs ? Math.round((k.runs_ok_24h / runs) * 1000) / 10 : null;
  const tiles: { label: string; value: string; tone?: "warn" | "bad" }[] = [
    { label: "Tickets 24h", value: fmt(k?.tickets_24h) },
    { label: "Run success", value: rate === null ? "—" : `${rate}%`, tone: rate !== null && rate < 95 ? "warn" : undefined },
    { label: "Latency p50 / p95", value: k ? `${ms(k.p50_latency_ms)} / ${ms(k.p95_latency_ms)}` : "—" },
    { label: "Model cost 24h", value: k ? `$${Number(k.cost_24h_usd).toFixed(4)}` : "—" },
    { label: "Queue / running", value: k ? `${k.queue_depth} / ${k.jobs_running}` : "—" },
    { label: "Awaiting approval", value: fmt(k?.pending_approvals), tone: k && k.pending_approvals > 10 ? "warn" : undefined },
    { label: "Dead letters", value: fmt(k?.dead_letters), tone: k && k.dead_letters > 0 ? "bad" : undefined },
    { label: "Fallbacks / guard blocks", value: k ? `${k.fallbacks_24h} / ${k.guard_blocks_24h}` : "—" },
  ];
  return (
    <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-zinc-400">{t.label}</div>
          <div
            className={`mt-1 text-xl font-semibold tabular-nums ${
              t.tone === "bad" ? "text-red-400" : t.tone === "warn" ? "text-amber-300" : ""
            }`}
          >
            {t.value}
          </div>
        </div>
      ))}
    </section>
  );
}

function RunFeed({ runs }: { runs: Run[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section>
      <SectionTitle title="Agent runs" note="Newest first, updates live" />
      <div className="overflow-hidden rounded-xl border border-white/10">
        {runs.length === 0 && <p className="p-4 text-sm text-zinc-500">No runs yet. Start the simulator.</p>}
        {runs.map((r) => (
          <div key={r.id} className="border-b border-white/5 last:border-0">
            <button
              onClick={() => setOpen(open === r.id ? null : r.id)}
              className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/[0.03]"
            >
              <StatusDot status={r.status} />
              <div className="min-w-0">
                <div className="truncate">
                  <span className="font-medium">{r.agent_id}</span>
                  <span className="text-zinc-500"> · {r.tickets?.intent ?? "—"} · {r.tickets?.channel}</span>
                </div>
                {r.error && <div className="truncate text-xs text-red-400">{r.error_kind}: {r.error}</div>}
              </div>
              <div className="text-right text-xs tabular-nums text-zinc-400">
                <div>{r.provider ?? "…"} · {r.latency_ms ? ms(r.latency_ms) : "running"}</div>
                <div>{r.input_tokens + r.output_tokens} tok · ${Number(r.cost_usd).toFixed(5)} · {ago(r.started_at)}</div>
              </div>
            </button>
            {open === r.id && <RunSteps run={r} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function RunSteps({ run }: { run: Run }) {
  const [steps, setSteps] = useState<Step[] | null>(null);
  useEffect(() => {
    supabase
      .from("run_steps")
      .select("*")
      .eq("run_id", run.id)
      .order("seq")
      .then(({ data }) => setSteps((data as Step[]) ?? []));
  }, [run.id, run.status]);

  return (
    <div className="bg-black/30 px-4 py-3 text-xs">
      {run.trace_url ? (
        <a href={run.trace_url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
          Open trace in Langfuse ↗
        </a>
      ) : (
        <span className="text-zinc-500">Langfuse not configured for this run</span>
      )}
      <ol className="mt-2 space-y-1.5">
        {(steps ?? []).map((s) => (
          <li key={s.id} className="grid grid-cols-[1.5rem_4.5rem_1fr_auto] gap-2">
            <span className="text-zinc-600">{s.seq}</span>
            <span className={s.status === "ok" ? "text-zinc-400" : s.status === "blocked" ? "text-amber-300" : "text-red-400"}>
              {s.kind}
            </span>
            <details>
              <summary className="cursor-pointer truncate">{s.name}</summary>
              <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-zinc-400">
                {JSON.stringify({ input: s.input, output: s.output }, null, 2)}
              </pre>
            </details>
            <span className="tabular-nums text-zinc-500">{s.latency_ms ? ms(s.latency_ms) : ""}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Approvals({ proposals }: { proposals: Proposal[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const act = (id: string, approve: boolean) =>
    start(async () => {
      const r = await decideProposal(id, approve);
      setMsg(r.ok ? null : r.error);
    });

  return (
    <section>
      <SectionTitle title="Awaiting approval" note={`${proposals.length} pending`} />
      {msg && <p className="mb-2 text-xs text-amber-300">{msg}</p>}
      <div className="space-y-3">
        {proposals.length === 0 && <p className="text-sm text-zinc-500">Nothing to review.</p>}
        {proposals.map((p) => (
          <article key={p.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${p.kind === "refund" ? "bg-amber-400/15 text-amber-300" : "bg-sky-400/15 text-sky-300"}`}>
                {p.kind === "refund" ? `Refund · tier ${p.tier}` : `Send reply · tier ${p.tier}`}
              </span>
              <span className="truncate text-xs text-zinc-500">{p.tickets?.customer_email}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-zinc-400">“{p.tickets?.body}”</p>
            {p.kind === "refund" ? (
              <p className="mt-2">
                {p.payload.order_id}: <strong>€{((p.payload.amount_cents ?? 0) / 100).toFixed(2)}</strong>{" "}
                <span className="text-zinc-400">({p.payload.reason})</span>
              </p>
            ) : (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-zinc-300">Draft reply</summary>
                <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-300">{p.payload.body}</p>
              </details>
            )}
            {p.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.flags.map((f) => (
                  <span key={f} className="rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-300">⚑ {f.replaceAll("_", " ")}</span>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button disabled={pending} onClick={() => act(p.id, true)} className="rounded-md bg-emerald-500/90 px-3 py-1 text-xs font-medium text-black hover:bg-emerald-400 disabled:opacity-50">
                Approve
              </button>
              <button disabled={pending} onClick={() => act(p.id, false)} className="rounded-md border border-white/15 px-3 py-1 text-xs hover:bg-white/5 disabled:opacity-50">
                Reject
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DeadLetters({ jobs }: { jobs: DeadJob[] }) {
  const [pending, start] = useTransition();
  return (
    <section>
      <SectionTitle title="Dead letter queue" note={jobs.length ? `${jobs.length} jobs` : "empty"} />
      <div className="space-y-2">
        {jobs.map((j) => (
          <div key={j.id} className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span>Job #{j.id} · {j.attempts} attempts</span>
              <button disabled={pending} onClick={() => start(async () => void (await retryDeadJob(j.id)))} className="rounded-md border border-white/15 px-2 py-0.5 hover:bg-white/5 disabled:opacity-50">
                Retry
              </button>
            </div>
            <p className="mt-1 break-all text-red-300">{j.last_error}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Audit({ entries }: { entries: AuditEntry[] }) {
  return (
    <section>
      <SectionTitle title="Audit log" note="Every consequential decision" />
      <ul className="space-y-1 text-xs">
        {entries.map((e) => (
          <li key={e.id} className="grid grid-cols-[3.5rem_1fr] gap-2">
            <span className="tabular-nums text-zinc-500">{ago(e.at)}</span>
            <span className="truncate">
              <span className="text-zinc-300">{e.actor}</span> <span className="text-zinc-500">{e.action.replaceAll("_", " ")}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
      <span className="text-xs text-zinc-500">{note}</span>
    </div>
  );
}

function StatusDot({ status }: { status: Run["status"] }) {
  const color = status === "succeeded" ? "bg-emerald-400" : status === "failed" ? "bg-red-500" : "animate-pulse bg-sky-400";
  return <span className={`h-2 w-2 rounded-full ${color}`} title={status} />;
}

function fmt(n: number | undefined) {
  return n === undefined ? "—" : String(n);
}

function ms(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;
}

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}
