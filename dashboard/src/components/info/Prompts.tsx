// Prompts, tools and model settings, fetched from the running core (GET /meta), so this
// page always shows what the agents actually receive rather than a copy that can drift.

import { loadMeta, type AgentMeta } from "@/lib/meta";

export default async function Prompts() {
  const meta = await loadMeta();
  if (!meta) {
    return (
      <p className="rounded-xl border border-line bg-panel p-4 text-sm text-muted">
        The core API is not reachable, so the live prompts cannot be shown. Start it with{" "}
        <code className="font-mono text-xs">uv run agentdesk api</code>.
      </p>
    );
  }
  const { triage, resolver } = meta.agents;
  return (
    <div className="space-y-6">
      <AgentPrompt
        name="Triage"
        how="One model call. Only the output tool is offered and the call is forced, so the answer is always structured. If it does not match the schema, the error goes back to the model once; a second failure fails the attempt and the queue retries it."
        meta={triage}
      />
      <AgentPrompt
        name="Resolver"
        how={`A loop of up to ${resolver.max_rounds} rounds. The model may call its granted tools (each result goes back as a tool message) and finishes by calling submit_resolution. The last round offers only that tool and forces it, so the loop always ends with an answer.`}
        meta={resolver}
      />

      <div className="rounded-xl border border-line bg-panel">
        <h3 className="border-b border-line px-4 py-3 text-sm font-medium">Models</h3>
        <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2">
          <Row label="Fallback chain" value={meta.models.configured_chain.join(" → ")} />
          <Row label="Active now" value={meta.models.chain.join(" → ") || "none"} />
          <Row label="Mistral model" value={meta.models.mistral_model} />
          <Row label="Anthropic model" value={meta.models.anthropic_model} />
          <Row label="Attempts per provider" value={`${meta.models.attempts_per_provider}, jittered backoff`} />
          <Row
            label="Circuit breaker"
            value={`opens after ${meta.models.breaker.failure_threshold} failures, probes after ${meta.models.breaker.cooldown_s}s`}
          />
        </dl>
        <p className="border-t border-line px-4 py-3 text-xs text-faint">
          Both providers are called over plain HTTP through one adapter each; tool calls are normalised to one shape, so the
          agents do not know which model answered. Without API keys the chain falls through to the offline model, a labelled
          rule-based stand-in for development and demos.
        </p>
      </div>
    </div>
  );
}

function AgentPrompt({ name, how, meta }: { name: string; how: string; meta: AgentMeta }) {
  return (
    <div className="rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <h3 className="text-sm font-medium">{name} agent</h3>
        <p className="mt-1 text-sm text-muted">{how}</p>
      </div>
      <div className="grid gap-px bg-line lg:grid-cols-2">
        <Block title="System prompt" body={meta.system_prompt} />
        <Block title="User message (example)" body={meta.example_user_message} />
      </div>
      <div className="space-y-2 border-t border-line p-4">
        <div className="text-xs text-faint">Tools offered to the model</div>
        {[...meta.tools, meta.output_tool].map((t) => (
          <details key={t.name} className="rounded-lg border border-line bg-panel-2 px-3 py-2">
            <summary className="cursor-pointer text-sm">
              <span className="font-mono text-xs text-brand">{t.name}</span>
              <span className="ml-2 text-muted">{t.description}</span>
              {t.name === meta.output_tool.name && <span className="ml-2 text-xs text-faint">(structured output)</span>}
            </summary>
            <pre className="mt-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-muted">
              {JSON.stringify(t.parameters, null, 2)}
            </pre>
          </details>
        ))}
      </div>
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-panel p-4">
      <div className="text-xs text-faint">{title}</div>
      <pre className="mt-2 whitespace-pre-wrap font-mono text-[12px] leading-relaxed text-ink">{body}</pre>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="mt-0.5 font-mono text-xs text-ink">{value}</dd>
    </div>
  );
}
