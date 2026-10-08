"use client";

import { Fragment, useState } from "react";
import { useLiveQuery } from "@/components/live";
import { Badge, Card, Empty, PageHeader, Stat, Td, Th } from "@/components/ui";
import { ago, humanize, usd } from "@/lib/format";
import { supabase } from "@/lib/supabase";

type EvalRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: string;
  git_sha: string | null;
  model_chain: string[];
  judge_model: string | null;
  cases: number;
  passed: number;
  safety_failed: number;
  pass_rate: number | null;
  gate_passed: boolean | null;
  cost_usd: number;
};

type EvalResult = {
  id: number;
  case_id: string;
  category: "behaviour" | "safety";
  description: string;
  passed: boolean;
  assertions: { name: string; passed: boolean; detail: string }[];
  judge: { overall?: number; reasoning?: string; model?: string; error?: string } | null;
  output: { reply?: string; refund?: { order_id: string; amount_cents: number } | null; intent?: string; flags?: string[]; blocked?: string[] };
  trace_url: string | null;
};

export default function EvalsPage() {
  const runs = useLiveQuery(
    () => supabase.from("eval_runs").select("*").order("started_at", { ascending: false }).limit(20).then((r) => (r.data as EvalRun[]) ?? []),
    [],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const selected = runs.find((r) => r.id === picked) ?? runs[0];
  const results = useLiveQuery(
    () =>
      selected
        ? supabase.from("eval_results").select("*").eq("eval_run_id", selected.id).order("category").order("case_id").then((r) => (r.data as EvalResult[]) ?? [])
        : Promise.resolve([] as EvalResult[]),
    [],
    [selected?.id],
  );

  return (
    <>
      <PageHeader
        title="Evals"
        description="The golden suite: tickets with known right answers, run through the real agents. Each case checks behaviour (what the agents did) and, with a real model, is graded by a judge. CI runs it on every push and blocks the merge if a safety case fails or the pass rate drops."
      />
      {!selected ? (
        <Card>
          <Empty>No evaluation runs yet. Run <code className="font-mono">uv run agentdesk eval</code> in core/.</Empty>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Gate" value={selected.gate_passed ? "Open" : "Closed"} tone={selected.gate_passed ? "ok" : "bad"} hint="No safety failure, pass rate ≥ 90%" />
            <Stat label="Pass rate" value={`${selected.pass_rate ?? 0}%`} hint={`${selected.passed} of ${selected.cases} cases`} />
            <Stat label="Safety failures" value={selected.safety_failed} tone={selected.safety_failed ? "bad" : "ok"} />
            <Stat label="Judge" value={selected.judge_model ? "On" : "Skipped"} hint={selected.judge_model ?? "needs a real model key"} />
          </div>

          <Card title="Cases" aside={`run ${selected.id.slice(0, 8)} · ${selected.model_chain.join(" → ")}`} className="mt-6">
            <ResultsTable results={results} />
          </Card>

          <Card title="History" className="mt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-line">
                  <tr>
                    <Th>Run</Th>
                    <Th>Trigger</Th>
                    <Th>Commit</Th>
                    <Th right>Passed</Th>
                    <Th>Gate</Th>
                    <Th right>Cost</Th>
                    <Th right>When</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setPicked(r.id)}
                      className={`cursor-pointer border-b border-line/60 hover:bg-ink/[0.02] ${r.id === selected.id ? "bg-ink/[0.04]" : ""}`}
                    >
                      <Td className="font-mono text-xs">{r.id.slice(0, 8)}</Td>
                      <Td className="text-muted">{r.trigger}</Td>
                      <Td className="font-mono text-xs text-faint">{r.git_sha ?? "—"}</Td>
                      <Td right>{r.passed}/{r.cases}</Td>
                      <Td><Badge tone={r.gate_passed ? "ok" : "bad"}>{r.gate_passed ? "open" : "closed"}</Badge></Td>
                      <Td right className="text-muted">{usd(r.cost_usd, 4)}</Td>
                      <Td right className="text-faint">{ago(r.started_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function ResultsTable({ results }: { results: EvalResult[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-line">
          <tr>
            <Th>Case</Th>
            <Th>Kind</Th>
            <Th>Result</Th>
            <Th>Judge</Th>
            <Th right>Checks</Th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const failed = r.assertions.filter((a) => !a.passed);
            return (
              <Fragment key={r.id}>
                <tr onClick={() => setOpen(open === r.id ? null : r.id)} className="cursor-pointer border-b border-line/60 hover:bg-ink/[0.02]">
                  <Td>
                    <div className="font-medium">{r.case_id}</div>
                    <div className="text-xs text-faint">{r.description}</div>
                  </Td>
                  <Td><Badge tone={r.category === "safety" ? "warn" : "default"}>{r.category}</Badge></Td>
                  <Td><Badge tone={r.passed ? "ok" : "bad"}>{r.passed ? "pass" : "fail"}</Badge></Td>
                  <Td className="text-muted">{r.judge?.overall ? `${r.judge.overall}/5` : "—"}</Td>
                  <Td right className="text-muted">{r.assertions.length - failed.length}/{r.assertions.length}</Td>
                </tr>
                {open === r.id && (
                  <tr className="border-b border-line/60 bg-canvas/60">
                    <td colSpan={5} className="px-4 py-4">
                      <div className="grid gap-5 lg:grid-cols-2">
                        <div>
                          <div className="text-xs text-faint">Assertions</div>
                          <ul className="mt-2 space-y-1 text-xs">
                            {r.assertions.map((a) => (
                              <li key={a.name} className="flex gap-2">
                                <span className={a.passed ? "text-ok" : "text-bad"}>{a.passed ? "✓" : "✗"}</span>
                                <span className="font-mono">{humanize(a.name)}</span>
                                {a.detail && <span className="text-faint">{a.detail}</span>}
                              </li>
                            ))}
                          </ul>
                          {r.judge?.reasoning && <p className="mt-3 text-xs text-muted">Judge: {r.judge.reasoning}</p>}
                          {r.trace_url && (
                            <a href={r.trace_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-info hover:underline">
                              Open trace in Langfuse ↗
                            </a>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-faint">
                            Reply{r.output.refund ? ` · refund ${r.output.refund.order_id} €${(r.output.refund.amount_cents / 100).toFixed(2)}` : ""}
                          </div>
                          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-panel-2 p-3 text-xs leading-relaxed">{r.output.reply || "—"}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
