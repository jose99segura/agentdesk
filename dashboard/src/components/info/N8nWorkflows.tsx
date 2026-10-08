import { Shot } from "./parts";

const WORKFLOWS = [
  {
    file: "n8n-00-create-ticket.jpg",
    name: "00 · create ticket (shared)",
    what: "The one place where a message becomes a ticket. It cleans the input (email, order number, message), rejects what is invalid, calls the API with three retries, and if the API stays down it alerts on Telegram and returns a clear “try again”. Both entry points below call it, so the rules live once.",
  },
  {
    file: "n8n-01-intake-webhook.jpg",
    name: "01 · intake webhook",
    what: "For a chat widget or a website: a POST endpoint. It answers 202 with the ticket id (queued, not resolved: agents work in the background), 400 for bad input and 503 if the platform is unreachable.",
  },
  {
    file: "n8n-02-contact-form.jpg",
    name: "02 · contact form",
    what: "A real contact form hosted by n8n itself (email, order number, message). The customer gets a confirmation page, or a retry message if something is down.",
  },
  {
    file: "n8n-03-traffic-generator.jpg",
    name: "03 · traffic generator",
    what: "Keeps the demo alive: every 15 minutes during the day, one to three simulated customers write in through the API. Switch it off and the store goes quiet.",
  },
  {
    file: "n8n-04-daily-report.jpg",
    name: "04 · daily report",
    what: "At 08:00 it reads the last 24 hours from the API (tickets, success rate, latency, cost, decisions, backlog, last evaluation) and sends one Telegram message.",
  },
  {
    file: "n8n-99-error-handler.jpg",
    name: "99 · error handler",
    what: "Registered as the error workflow of all the others: if any of them fails, it sends the workflow, the failing node, the error and a link to the execution to Telegram.",
  },
];

export default function N8nWorkflows() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {WORKFLOWS.map((w) => (
          <Shot
            key={w.file}
            src={`/info/${w.file}`}
            alt={`n8n workflow ${w.name}`}
            w={800}
            h={410}
            caption={
              <>
                <span className="font-semibold text-ink">{w.name}.</span> {w.what}
              </>
            }
          />
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted">
        All six live in the <span className="font-mono text-ink">agentdesk</span> folder of the n8n instance, numbered in the
        order a reader should open them, each with sticky notes on what it does and how it fails. Their source is{" "}
        <span className="font-mono text-ink">n8n/build.py</span>, which writes the JSON that is imported, so the workflows are
        reviewed like code. They need two credentials created in n8n (the API bearer token and the Telegram bot) and are
        switched on once the API has its public URL.
      </p>
    </div>
  );
}
