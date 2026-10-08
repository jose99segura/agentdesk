"use client";

import { Fragment, useEffect, useState } from "react";
import { ago, humanize, ms, usd } from "@/lib/format";
import { supabase, type Run, type Step } from "@/lib/supabase";
import { Badge, Dot, Empty, runTone, Td, Th } from "./ui";

export default function RunTable({ runs, compact = false }: { runs: Run[]; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (runs.length === 0) return <Empty>No runs yet. Start the simulator to send customer tickets.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line">
          <tr>
            <Th>Agent</Th>
            <Th>Ticket</Th>
            {!compact && <Th>Model</Th>}
            <Th right>Latency</Th>
            {!compact && <Th right>Tokens</Th>}
            <Th right>Cost</Th>
            <Th right>When</Th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <Fragment key={r.id}>
              <tr
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className={`cursor-pointer border-b border-line/60 transition-colors hover:bg-ink/[0.02] ${open === r.id ? "bg-ink/[0.03]" : ""}`}
              >
                <Td>
                  <div className="flex items-center gap-2">
                    <Dot tone={runTone(r.status)} pulse={r.status === "running"} />
                    <span className="font-medium">{r.agent_id}</span>
                  </div>
                </Td>
                <Td className="max-w-0 w-full">
                  <div className="truncate text-muted">
                    <span className="text-ink">{humanize(r.tickets?.intent) || "untriaged"}</span>
                    <span className="text-faint"> · {r.tickets?.channel}</span>
                    {r.error && <span className="text-bad"> · {r.error_kind}</span>}
                  </div>
                </Td>
                {!compact && <Td className="whitespace-nowrap text-muted">{r.provider ?? "—"}</Td>}
                <Td right>{r.status === "running" ? "…" : ms(r.latency_ms)}</Td>
                {!compact && <Td right className="text-muted">{r.input_tokens + r.output_tokens}</Td>}
                <Td right className="text-muted">{usd(r.cost_usd, 5)}</Td>
                <Td right className="whitespace-nowrap text-faint">{ago(r.started_at)}</Td>
              </tr>
              {open === r.id && (
                <tr className="border-b border-line/60 bg-canvas/60">
                  <td colSpan={compact ? 5 : 7} className="px-4 py-4">
                    <RunDetail run={r} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const KIND_TONE = { llm: "info", tool: "default", guard: "ok", fallback: "warn", retry: "warn", error: "bad" } as const;

function RunDetail({ run }: { run: Run }) {
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
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-3 text-xs">
        <div>
          <div className="text-faint">Customer message</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{run.tickets?.body ?? "—"}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Meta label="Status" value={run.status} />
          <Meta label="Model" value={run.model ? `${run.provider}/${run.model}` : "—"} />
          <Meta label="Tokens in / out" value={`${run.input_tokens} / ${run.output_tokens}`} />
          <Meta label="Cost" value={usd(run.cost_usd, 6)} />
        </dl>
        {run.error && <p className="rounded-md bg-bad/10 px-3 py-2 text-bad">{run.error}</p>}
        {run.trace_url ? (
          <a href={run.trace_url} target="_blank" rel="noreferrer" className="inline-block text-info hover:underline">
            Open full trace in Langfuse ↗
          </a>
        ) : (
          <span className="text-faint">Langfuse is not configured for this run.</span>
        )}
      </div>
      <ol className="relative space-y-2 border-l border-line pl-4">
        {(steps ?? []).map((s) => (
          <li key={s.id} className="relative">
            <span className="absolute -left-[21px] top-1.5">
              <Dot tone={s.status === "ok" ? "ok" : s.status === "blocked" ? "warn" : "bad"} />
            </span>
            <details>
              <summary className="flex cursor-pointer items-center gap-2 text-xs">
                <Badge tone={KIND_TONE[s.kind as keyof typeof KIND_TONE] ?? "default"}>{s.kind}</Badge>
                <span className="truncate">{s.name}</span>
                <span className="ml-auto tabular-nums text-faint">{s.latency_ms ? ms(s.latency_ms) : ""}</span>
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-canvas p-3 font-mono text-[11px] text-muted">
                {JSON.stringify({ input: s.input, output: s.output }, null, 2)}
              </pre>
            </details>
          </li>
        ))}
        {steps?.length === 0 && <li className="text-xs text-faint">No steps recorded.</li>}
      </ol>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-faint">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
