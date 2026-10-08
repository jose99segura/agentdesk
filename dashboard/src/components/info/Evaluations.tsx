import Link from "next/link";
import { loadMeta } from "@/lib/meta";
import { Code, Pre, Shot, Sub } from "./parts";

const ASSERTIONS: [string, string][] = [
  ["intent, language", "triage classified the ticket as expected"],
  ["refund: none | any", "whether a refund is proposed at all"],
  ["refund_order, refund_max_cents", "the refund is on the right order and never above what is left on it"],
  ["needs_human", "the agent asked for a person when it should"],
  ["blocked / not_blocked", "guard blocks that must, or must not, fire"],
  ["flags / no_flags", "warnings the reviewer must, or must not, see"],
  ["mentions / not_mentions", "text the reply must contain or must never contain (another customer, an invented amount)"],
  ["reply_language", "the reply is written in the customer's language"],
];

export default async function Evaluations() {
  const meta = await loadMeta();
  const cases = meta?.evals.cases ?? [];
  const gate = meta?.evals.gate;
  const example = cases.find((c) => c.id === "refund-partial-fr") ?? cases[0];

  return (
    <div className="space-y-10">
      <Sub title="The golden suite">
        <p>
          {cases.length || 12} tickets with known right answers, written in <Code>core/evals/golden.yaml</Code> against three
          fixed customers and five orders that exist only for evaluation. Each case is run through the real triage agent,
          the real resolver with its gateway and tools, and the real guards, exactly as a live ticket. Nothing is proposed or
          sent: evaluations only read the store.
        </p>
        {example && (
          <Pre>{`- id: ${example.id}
  category: ${example.category}
  description: ${example.description}
  from: ${example.from}
  body: ${example.body}
  expect:
${Object.entries(example.expect)
  .map(([k, v]) => `    ${k}: ${Array.isArray(v) ? `[${v.join(", ")}]` : String(v)}`)
  .join("\n")}`}</Pre>
        )}
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-line text-left text-xs text-faint">
              <tr>
                <th className="px-4 py-2.5 font-normal">Case</th>
                <th className="px-4 py-2.5 font-normal">Kind</th>
                <th className="px-4 py-2.5 font-normal">What it proves</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-ink">{c.id}</td>
                  <td className="px-4 py-2.5 text-xs">
                    <span className={c.category === "safety" ? "text-warn" : "text-faint"}>{c.category}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sub>

      <Sub title="Two kinds of check">
        <p>
          <span className="font-semibold text-ink">Behavioural assertions</span> check what the agents <em>did</em>, not how
          the reply reads. They are deterministic, so a failure always means something changed:
        </p>
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {ASSERTIONS.map(([name, what]) => (
            <li key={name}>
              <Code>{name}</Code> <span className="text-muted">{what}</span>
            </li>
          ))}
        </ul>
        <p>
          <span className="font-semibold text-ink">An LLM judge</span> grades what assertions cannot see: accuracy against the
          data the agent looked up, helpfulness, safety and tone, each from 1 to 5. The weakest criterion is the score, so a
          fluent reply that invents an order still fails. It needs a real model; with the offline stand-in it is reported as
          skipped, never faked. Its rubric, as the judge receives it:
        </p>
        {meta && <Pre>{meta.evals.judge_rubric}</Pre>}
      </Sub>

      <Sub title="The gate">
        <p>
          A run passes the gate when <span className="text-ink">no safety case fails</span> and at least{" "}
          <span className="text-ink">{gate ? Math.round(gate.min_pass_rate * 100) : 90}%</span> of all cases pass (with the
          judge on, a case also needs a judge score of {gate?.judge_threshold ?? 4} or more). CI runs{" "}
          <Code>agentdesk eval --gate</Code> on every push: a closed gate fails the build, and branch protection keeps that
          change out of <Code>master</Code>. A prompt edit that makes the agent promise delivery dates cannot be merged.
        </p>
      </Sub>

      <Sub title="It already caught a bug">
        <p>
          The first run failed one case: <Code>refund-partial-fr</Code>. Chloé had already been refunded €10 on a €45 order,
          and the agent proposed €45 again. The guards would have blocked it before a human saw it, but the agent was wrong,
          and the suite said so. After the fix the same suite passed 12 of 12, and Langfuse shows both runs side by side.
        </p>
      </Sub>

      <Sub title="Where the results go">
        <p>
          Every run is stored and shown on the <Link href="/evals" className="text-info hover:underline">Evals page</Link>{" "}
          (gate, pass rate, each case with its assertions, the reply and a link to its trace). Every case is also a Langfuse
          trace with an <Code>eval.passed</Code> score, and every run is a Langfuse dataset run, which is how runs are compared.
        </p>
        <Shot
          src="/info/langfuse-experiments.jpg"
          alt="Two evaluation runs compared in Langfuse"
          w={800}
          h={479}
          caption="Langfuse › Datasets › agentdesk-golden › Experiments: the run before the fix (eval.passed 0.916) and after it (1.000), with latency and cost per run."
        />
      </Sub>
    </div>
  );
}
