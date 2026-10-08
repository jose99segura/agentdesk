"use client";

import { useState } from "react";
import { useLiveQuery } from "@/components/live";
import RunTable from "@/components/RunTable";
import { Card, PageHeader } from "@/components/ui";
import { supabase, type Run } from "@/lib/supabase";

const FILTERS = ["all", "succeeded", "failed", "running"] as const;
type Filter = (typeof FILTERS)[number];

export default function RunsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [agent, setAgent] = useState<"all" | "triage" | "resolver">("all");
  const runs = useLiveQuery(
    () => {
      let q = supabase
        .from("runs")
        .select("*, tickets(subject, channel, intent, body)")
        .is("eval_run_id", null)
        .order("started_at", { ascending: false })
        .limit(60);
      if (filter !== "all") q = q.eq("status", filter);
      if (agent !== "all") q = q.eq("agent_id", agent);
      return q.then((r) => (r.data as Run[]) ?? []);
    },
    [],
    [filter, agent],
  );

  return (
    <>
      <PageHeader
        title="Runs"
        description="Every agent execution with its model, cost and latency. Open a run to see each step: model calls, tool calls through the gateway, fallbacks and guard checks."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={filter} options={FILTERS} onChange={setFilter} />
        <Segmented value={agent} options={["all", "triage", "resolver"] as const} onChange={setAgent} />
      </div>
      <Card>
        <RunTable runs={runs} />
      </Card>
    </>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-panel p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`rounded-md px-2.5 py-1 capitalize transition-colors ${value === o ? "bg-ink/10 text-ink" : "text-faint hover:text-ink"}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
