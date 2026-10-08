"use client";

import Link from "next/link";
import ApprovalCard from "@/components/ApprovalCard";
import { useLiveQuery } from "@/components/live";
import RunTable from "@/components/RunTable";
import Throughput from "@/components/Throughput";
import { Card, PageHeader, Stat } from "@/components/ui";
import { ms, usd } from "@/lib/format";
import { supabase, type Kpis, type MinuteBucket, type Proposal, type Run } from "@/lib/supabase";

export default function Overview() {
  const k = useLiveQuery(() => supabase.from("dashboard_kpis").select("*").single().then((r) => r.data as Kpis | null), null);
  const series = useLiveQuery(
    () => supabase.from("runs_per_minute").select("*").then((r) => (r.data as MinuteBucket[]) ?? []),
    [],
  );
  const runs = useLiveQuery(
    () =>
      supabase
        .from("runs")
        .select("*, tickets(subject, channel, intent, body)")
        .order("started_at", { ascending: false })
        .limit(8)
        .then((r) => (r.data as Run[]) ?? []),
    [],
  );
  const approvals = useLiveQuery(
    () =>
      supabase
        .from("proposals")
        .select("*, tickets(customer_email, channel, body, language)")
        .eq("status", "pending")
        .order("tier", { ascending: false })
        .order("created_at")
        .limit(2)
        .then((r) => (r.data as Proposal[]) ?? []),
    [],
  );

  const total = k ? k.runs_ok_24h + k.runs_failed_24h : 0;
  const rate = k && total ? (k.runs_ok_24h / total) * 100 : null;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Support tickets handled by agents in the last 24 hours. Agents propose; nothing reaches a customer or moves money until a human approves it."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tickets (24h)" value={k?.tickets_24h ?? "—"} hint={k ? `${total} agent runs` : undefined} />
        <Stat
          label="Run success"
          value={rate === null ? "—" : `${rate.toFixed(1)}%`}
          tone={rate === null ? "default" : rate >= 99 ? "ok" : rate >= 95 ? "warn" : "bad"}
          hint={k ? `${k.runs_failed_24h} failed` : undefined}
        />
        <Stat label="Latency p50" value={ms(k?.p50_latency_ms)} hint={k ? `p95 ${ms(k.p95_latency_ms)}` : undefined} />
        <Stat label="Model cost (24h)" value={usd(k?.cost_24h_usd, 4)} hint="Tokens priced per provider" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Queue" value={k ? `${k.queue_depth}` : "—"} hint={k ? `${k.jobs_running} running now` : undefined} />
        <Stat label="Awaiting approval" value={k?.pending_approvals ?? "—"} tone={k && k.pending_approvals > 15 ? "warn" : "default"} hint="Replies and refunds" />
        <Stat label="Dead letters" value={k?.dead_letters ?? "—"} tone={k && k.dead_letters > 0 ? "bad" : "ok"} hint="Jobs out of retries" />
        <Stat label="Fallbacks · guard blocks" value={k ? `${k.fallbacks_24h} · ${k.guard_blocks_24h}` : "—"} hint="Last 24 hours" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Throughput" aside="Runs per minute, last hour">
          <Throughput data={series} />
        </Card>
        <Card title="Needs you" aside={<Link href="/approvals" className="hover:text-ink">All approvals →</Link>}>
          <div className="space-y-3 p-3">
            {approvals.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-faint">Nothing waiting for a decision.</p>
            ) : (
              approvals.map((p) => <ApprovalCard key={p.id} p={p} />)
            )}
          </div>
        </Card>
      </div>

      <Card title="Latest runs" aside={<Link href="/runs" className="hover:text-ink">All runs →</Link>} className="mt-6">
        <RunTable runs={runs} compact />
      </Card>
    </>
  );
}
