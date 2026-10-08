"use client";

import { useLiveQuery } from "@/components/live";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ago, ms, usd } from "@/lib/format";
import { supabase, type AgentStat } from "@/lib/supabase";

const TIERS = [
  { tier: 0, label: "Read internal data", who: "Agent, no review" },
  { tier: 1, label: "Draft for a human", who: "Agent, output reviewed" },
  { tier: 2, label: "Send to a customer", who: "Proposal, human approves" },
  { tier: 3, label: "Move money", who: "Proposal, human approves, re-validated" },
];

export default function AgentsPage() {
  const agents = useLiveQuery(
    () => supabase.from("agent_stats").select("*").order("tier").then((r) => (r.data as AgentStat[]) ?? []),
    [],
  );

  return (
    <>
      <PageHeader
        title="Agents"
        description="The registry. Nothing runs without a row here: an owner, a risk tier and the exact tools it may call. The gateway offers an agent only these tools, and the database role it runs as cannot do anything above tier 1."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((a) => {
          const failRate = a.runs_24h ? (a.failed_24h / a.runs_24h) * 100 : 0;
          return (
            <Card key={a.id}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">{a.name}</h2>
                    <p className="mt-0.5 text-xs text-faint">
                      id <span className="font-mono">{a.id}</span> · owner {a.owner}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Badge tone="info">tier {a.tier}</Badge>
                    <Badge tone={a.active ? "ok" : "default"}>{a.active ? "active" : "disabled"}</Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted">{a.description}</p>
                <div className="mt-4">
                  <div className="text-xs text-faint">Granted tools</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {a.tools.length === 0 ? (
                      <span className="text-xs text-faint">None: no data access beyond its input</span>
                    ) : (
                      a.tools.map((t) => (
                        <span key={t} className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
                          {t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-4 gap-3 border-t border-line pt-4 text-xs">
                  <Metric label="Runs 24h" value={String(a.runs_24h)} />
                  <Metric label="Failure rate" value={`${failRate.toFixed(1)}%`} />
                  <Metric label="p50 latency" value={ms(a.p50_latency_ms)} />
                  <Metric label="Cost 24h" value={usd(a.cost_24h_usd, 4)} />
                </dl>
                <p className="mt-3 text-[11px] text-faint">Last run {ago(a.last_run_at)}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card title="Risk tiers" className="mt-6">
        <ol className="grid gap-px overflow-hidden rounded-b-xl bg-line sm:grid-cols-4">
          {TIERS.map((t) => (
            <li key={t.tier} className="bg-panel p-4">
              <div className="text-2xl font-semibold tabular-nums text-faint">{t.tier}</div>
              <div className="mt-1 text-sm font-medium">{t.label}</div>
              <div className="mt-0.5 text-xs text-faint">{t.who}</div>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
