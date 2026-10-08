// Every failure the platform is designed for: how it is noticed, what the system does,
// and where a person sees it. Order follows a ticket's path through the system.

const FAILURES: { what: string; detected: string; response: string; visible: string }[] = [
  {
    what: "Same message delivered twice",
    detected: "Unique external_id on tickets",
    response: "Second insert is a no-op; the API answers with the existing ticket and duplicate: true.",
    visible: "API response",
  },
  {
    what: "Invalid request to the API",
    detected: "Pydantic validation, bearer token check",
    response: "422 with the field errors, or 401. Nothing is written.",
    visible: "API response, n8n “Rejected (400)” branch",
  },
  {
    what: "Model provider slow or down (timeout, 429, 5xx)",
    detected: "Transient ProviderError in the router",
    response: "Retried on the same provider with jittered backoff, then the next provider in the chain.",
    visible: "retry and fallback steps in Runs, Langfuse spans",
  },
  {
    what: "Provider keeps failing",
    detected: "Three consecutive failures",
    response: "Its circuit opens: calls skip it for 30s, then one probe decides whether it closes.",
    visible: "Top bar, Telegram alert (deduplicated)",
  },
  {
    what: "Bad key or bad request to a provider (4xx)",
    detected: "Permanent ProviderError",
    response: "No retry on that provider; straight to the next one.",
    visible: "error step in the run",
  },
  {
    what: "Every provider failed",
    detected: "AllProvidersFailed",
    response: "The attempt fails; the job is rescheduled with backoff (5s, 10s, 20s).",
    visible: "Queue page, failed run",
  },
  {
    what: "Model answer does not match the schema",
    detected: "Pydantic validation of the tool call",
    response: "The error goes back to the model for one repair turn; a second failure fails the attempt.",
    visible: "guard step “schema” in the run",
  },
  {
    what: "Model calls a tool it was not granted",
    detected: "Gateway grant check",
    response: "Refused; the model gets an error result and continues. The database role could not have run it anyway.",
    visible: "blocked tool step",
  },
  {
    what: "Model invents an order, over-refunds, or leaks another customer",
    detected: "Guards, checked against the database",
    response: "The run is blocked and the ticket goes to a person; nothing is proposed.",
    visible: "guard step, audit log “guard blocked”, Overview counter",
  },
  {
    what: "Prompt injection in the customer message",
    detected: "Pattern check on the ticket",
    response: "The proposal carries a flag so the reviewer reads it twice; tools and grants are unchanged.",
    visible: "⚑ flag on the approval card",
  },
  {
    what: "Worker crashes mid-run",
    detected: "Lease expiry (5 minutes)",
    response: "The job is reclaimed and runs again; finished stages are skipped, effects were never half-written.",
    visible: "Queue page, “lease expired” as last error",
  },
  {
    what: "Job out of attempts",
    detected: "attempts ≥ max_attempts",
    response: "Moved to the dead letter queue; the ticket is marked failed.",
    visible: "Queue page with Retry, Telegram alert, audit log",
  },
  {
    what: "Proposal no longer valid when approved",
    detected: "Re-validation in the executor (row locked)",
    response: "Not executed; the proposal is marked failed with the reason.",
    visible: "Approvals “recently decided”, 409 from the API",
  },
  {
    what: "Approved twice (double click, dashboard and Telegram)",
    detected: "Proposal status checked under a row lock",
    response: "Second decision is a no-op: “already decided”.",
    visible: "Telegram message, API response",
  },
  {
    what: "Telegram unreachable",
    detected: "Send error",
    response: "The proposal stays unannounced and is retried on the next pass; nothing is lost.",
    visible: "notifications table",
  },
  {
    what: "Langfuse unreachable",
    detected: "Ingestion error in the background thread",
    response: "Logged and dropped. Tracing never blocks or fails a run; the database copy of every step remains.",
    visible: "worker log",
  },
];

export default function Failures() {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-line text-left text-xs text-faint">
          <tr>
            <th className="px-4 py-2.5 font-normal">What fails</th>
            <th className="px-4 py-2.5 font-normal">Detected by</th>
            <th className="px-4 py-2.5 font-normal">What the system does</th>
            <th className="px-4 py-2.5 font-normal">Where you see it</th>
          </tr>
        </thead>
        <tbody>
          {FAILURES.map((f) => (
            <tr key={f.what} className="border-b border-line/60 align-top last:border-0">
              <td className="px-4 py-3 font-medium">{f.what}</td>
              <td className="px-4 py-3 text-muted">{f.detected}</td>
              <td className="px-4 py-3 text-muted">{f.response}</td>
              <td className="px-4 py-3 text-xs text-faint">{f.visible}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
