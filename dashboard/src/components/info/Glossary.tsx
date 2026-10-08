const TERMS: [string, string][] = [
  ["Agent", "A model given a job, a prompt and some tools. Here: triage (classify) and resolver (look up and draft)."],
  ["Tool call", "The model asking the platform to run a function, such as “get this order”, instead of guessing."],
  ["Structured output", "The model answers by filling a JSON schema, so the platform can check the answer field by field."],
  ["Proposal", "Something an agent wants to do to the outside world (send a reply, refund). Nothing happens until a person approves."],
  ["Risk tier", "How dangerous an action is: 0 read, 1 draft, 2 send to a customer, 3 move money. Higher tiers need a human."],
  ["Guard", "A deterministic check on the agent's output, run before anything is proposed."],
  ["Gateway", "The single door between an agent and data: it only opens for the tools the agent was granted."],
  ["Database role", "A database login with its own permissions. The agents' role simply has no permission to refund or send."],
  ["RLS", "Row level security: Postgres rules about who may read which rows. The dashboard can read runs, not customers."],
  ["Queue", "A waiting list of work. A ticket is queued, then a worker picks it up; nothing is lost if a worker stops."],
  ["Idempotent", "Doing it twice has the same effect as doing it once: a repeated message, approval or retry changes nothing."],
  ["Backoff", "Waiting longer after each failed attempt (5s, 10s, 20s), so a struggling service is not hammered."],
  ["Dead letter queue", "Where a job goes after its last failed attempt, to wait for a person instead of being lost."],
  ["Fallback", "When one model provider fails, the next one in the chain answers instead."],
  ["Circuit breaker", "After repeated failures a provider is skipped for a while, then tested with a single call."],
  ["Trace", "The complete record of one ticket's processing: every model call, tool call and decision, in order."],
  ["Evaluation", "Running the agents on tickets with known right answers and scoring the result."],
  ["Gate", "The rule that decides whether a change may be merged, based on the evaluation."],
  ["LLM judge", "A second model that grades the first one's reply against a written rubric."],
  ["Realtime", "The database pushes every change to the dashboard, which is why it updates by itself."],
];

export default function Glossary() {
  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
      {TERMS.map(([term, def]) => (
        <div key={term} className="bg-panel p-4">
          <dt className="text-sm font-semibold">{term}</dt>
          <dd className="mt-1 text-sm leading-relaxed text-muted">{def}</dd>
        </div>
      ))}
    </dl>
  );
}
