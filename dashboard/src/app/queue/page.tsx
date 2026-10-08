"use client";

import { useState, useTransition } from "react";
import { retryDeadJob } from "@/app/actions";
import { useLiveQuery } from "@/components/live";
import { Badge, Button, Card, Empty, PageHeader, Stat, Td, Th } from "@/components/ui";
import { ago } from "@/lib/format";
import { supabase, type Job, type Kpis } from "@/lib/supabase";

const STATUS_TONE = { queued: "info", running: "info", done: "ok", dead: "bad" } as const;

export default function QueuePage() {
  const k = useLiveQuery(() => supabase.from("dashboard_kpis").select("*").single().then((r) => r.data as Kpis | null), null);
  const dead = useLiveQuery(
    () => supabase.from("jobs").select("*").eq("status", "dead").order("updated_at", { ascending: false }).limit(50).then((r) => (r.data as Job[]) ?? []),
    [],
  );
  const recent = useLiveQuery(
    () => supabase.from("jobs").select("*").order("updated_at", { ascending: false }).limit(25).then((r) => (r.data as Job[]) ?? []),
    [],
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const retryAll = () =>
    start(async () => {
      for (const j of dead) {
        const r = await retryDeadJob(j.id);
        if (!r.ok) {
          setError(r.error);
          return;
        }
      }
      setError(null);
    });

  return (
    <>
      <PageHeader
        title="Queue"
        description="A durable job queue on Postgres. Failed attempts retry with exponential backoff; jobs that run out of attempts land in the dead letter queue and wait for a human. A job whose worker dies is reclaimed when its lease expires."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Queued" value={k?.queue_depth ?? "—"} />
        <Stat label="Running" value={k?.jobs_running ?? "—"} />
        <Stat label="Dead letters" value={k?.dead_letters ?? "—"} tone={k && k.dead_letters > 0 ? "bad" : "ok"} />
        <Stat label="Max attempts" value="4" hint="Backoff 5s · 10s · 20s, jittered" />
      </div>

      <Card
        title="Dead letter queue"
        aside={
          dead.length > 0 && (
            <Button disabled={pending} onClick={retryAll}>
              Retry all ({dead.length})
            </Button>
          )
        }
        className="mt-6"
      >
        {error && <p className="px-4 pt-3 text-xs text-warn">{error}</p>}
        {dead.length === 0 ? (
          <Empty>Empty. Every job either finished or is still being retried.</Empty>
        ) : (
          <ul className="divide-y divide-line/60">
            {dead.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div>
                    Job #{j.id} <span className="text-faint">· {j.attempts} attempts · {ago(j.updated_at)}</span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-bad">{j.last_error}</p>
                </div>
                <Button disabled={pending} onClick={() => start(async () => void (await retryDeadJob(j.id)))}>
                  Retry
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent jobs" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Job</Th>
                <Th>Status</Th>
                <Th right>Attempts</Th>
                <Th>Worker</Th>
                <Th>Last error</Th>
                <Th right>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((j) => (
                <tr key={j.id} className="border-b border-line/60">
                  <Td className="whitespace-nowrap">#{j.id} <span className="text-faint">{j.kind}</span></Td>
                  <Td><Badge tone={STATUS_TONE[j.status]}>{j.status}</Badge></Td>
                  <Td right>{j.attempts}/{j.max_attempts}</Td>
                  <Td className="text-faint">{j.locked_by ?? "—"}</Td>
                  <Td className="max-w-0 w-full"><span className="block truncate font-mono text-xs text-faint">{j.last_error ?? ""}</span></Td>
                  <Td right className="whitespace-nowrap text-faint">{ago(j.updated_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
