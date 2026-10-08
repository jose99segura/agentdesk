import { N8N_FOLDER_URL, N8N_URL, N8N_WORKFLOW_IDS } from "./content";
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

function workflowUrl(name: string): string {
  const id = N8N_WORKFLOW_IDS[name.slice(0, 2)];
  return id ? `${N8N_URL}/workflow/${id}` : N8N_FOLDER_URL;
}

export default function N8nWorkflows() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3">
        <p className="text-sm text-muted">
          All six live in the <span className="font-mono text-ink">agentdesk</span> folder of the self-hosted n8n. Open any of
          them to read the sticky notes on what it does and how it fails.
        </p>
        <a
          href={N8N_FOLDER_URL}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-ink/5"
        >
          Open the folder in n8n ↗
        </a>
      </div>
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
                <span className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-ink">{w.name}</span>
                  <a
                    href={workflowUrl(w.name)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-xs font-medium text-brand underline decoration-dotted hover:text-ink"
                  >
                    Open in n8n ↗
                  </a>
                </span>
                <span className="mt-1 block">{w.what}</span>
              </>
            }
          />
        ))}
      </div>
      <p className="text-sm leading-relaxed text-muted">
        They are numbered in the order a reader should open them. Their source is{" "}
        <span className="font-mono text-ink">n8n/build.py</span>, which writes the JSON that is imported, so the workflows are
        reviewed like code. They need two credentials created in n8n (the API bearer token and the Telegram bot) and are
        switched on once the API has its public URL.
      </p>
    </div>
  );
}
