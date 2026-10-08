import Image from "next/image";

const NODES = [
  ["Inbound message", "Webhook (POST). The form or chat widget posts here; the response is sent by a later node."],
  ["Normalize and validate", "Code node. Maps the sender's fields to a ticket, checks the email and message, and turns the sender's id into external_id so a redelivery is one ticket."],
  ["Valid?", "Invalid input is answered with 400 right away and never reaches the platform."],
  ["Create ticket", "HTTP request to the agentdesk API with a bearer header. Retries 3 times, 2s apart; an error after that takes the error output instead of failing the workflow."],
  ["Accepted (202)", "Returns the ticket id. The answer is “queued”, not “resolved”: agents work asynchronously."],
  ["Alert on Telegram → Unavailable (503)", "The API could not be reached: someone is told, and the sender gets a clear retryable error."],
];

export default function N8nIntake() {
  return (
    <div className="space-y-4">
      <figure className="overflow-hidden rounded-xl border border-line bg-white">
        <Image
          src="/info/n8n-ticket-intake.png"
          alt="The agentdesk ticket intake workflow in n8n"
          width={730}
          height={240}
          className="mx-auto h-auto w-full max-w-[730px]"
        />
      </figure>
      <ol className="grid gap-2 sm:grid-cols-2">
        {NODES.map(([name, body], i) => (
          <li key={name} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex items-baseline gap-2">
              <span className="text-xs tabular-nums text-faint">{i + 1}</span>
              <h3 className="text-sm font-medium">{name}</h3>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ol>
      <p className="text-xs leading-relaxed text-faint">
        Captured from the n8n instance, where it lives in the <span className="font-mono">agentdesk</span> folder; the
        source is <span className="font-mono">n8n/ticket-intake.json</span> in the repository. It stays inactive until the
        API is deployed with a public URL, and its two credentials (the API&apos;s bearer header and the Telegram bot) are
        added in n8n, never in the workflow file. n8n owns the channel; validation, governance and retries of the agents
        stay in the platform.
      </p>
    </div>
  );
}
