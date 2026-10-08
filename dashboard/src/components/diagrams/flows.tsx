import { Arrow, Box, Diagram, Label } from "./kit";

/** Who talks to whom, in order, for one ticket: a sequence diagram. */
export function TicketSequence() {
  const id = "seq";
  const lanes: [string, number, "plain" | "data" | "agent" | "gov" | "human" | "info"][] = [
    ["Customer", 70, "plain"],
    ["n8n", 210, "info"],
    ["API + queue", 350, "data"],
    ["Agents", 490, "agent"],
    ["Guards", 630, "gov"],
    ["You", 770, "human"],
    ["Store", 910, "data"],
  ];
  const msg = (x1: number, x2: number, y: number, text: string, opts: { dashed?: boolean; tone?: "ink" | "ok" | "brand" | "warn" } = {}) => {
    const dir = x2 > x1 ? 1 : -1;
    return (
      <g key={`${x1}-${x2}-${y}`}>
        <Arrow id={id} d={`M${x1 + 4 * dir} ${y} L${x2 - 4 * dir} ${y}`} dashed={opts.dashed} tone={opts.tone} />
        <Label x={(x1 + x2) / 2} y={y - 7}>{text}</Label>
      </g>
    );
  };
  return (
    <Diagram id={id} w={1000} h={560} label="Sequence of one ticket through the system">
      {lanes.map(([name, x, tone]) => (
        <g key={name}>
          <line x1={x} x2={x} y1={56} y2={548} stroke="var(--line-strong)" strokeDasharray="3 5" />
          <Box x={x - 62} y={14} w={124} h={40} title={name} tone={tone} />
        </g>
      ))}
      {msg(70, 210, 95, "writes in the contact form")}
      {msg(210, 350, 140, "POST /tickets (retried ×3)")}
      {msg(350, 210, 185, "202: queued", { dashed: true })}
      {msg(210, 70, 215, "“Message received”", { dashed: true })}
      {msg(350, 490, 265, "worker claims the job")}
      <rect x={482} y={282} width={16} height={66} rx={3} fill="color-mix(in srgb, var(--info) 18%, transparent)" stroke="var(--info)" />
      <Label x={506} y={306} anchor="start" tone="ink" weight={600}>triage + resolver</Label>
      <Label x={506} y={322} anchor="start">model ↔ tools</Label>
      {msg(490, 630, 375, "draft reply + refund")}
      {msg(630, 770, 420, "pending proposal", { tone: "warn" })}
      <Label x={700} y={438}>Telegram card · dashboard</Label>
      {msg(770, 910, 470, "approve → execute", { tone: "ok" })}
      {msg(910, 70, 520, "reply sent to the customer", { dashed: true, tone: "ok" })}
    </Diagram>
  );
}

/** How the six n8n workflows connect to each other and to the platform. */
export function N8nMap() {
  const id = "n8n";
  return (
    <Diagram id={id} w={1000} h={370} label="How the n8n workflows connect">
      <Label x={20} y={12} anchor="start" size={10} tone="faint">TRIGGERS</Label>
      <Box x={20} y={20} w={200} h={50} title="02 · contact form" sub="customers" tone="info" />
      <Box x={20} y={90} w={200} h={50} title="01 · intake webhook" sub="chat widgets, websites" tone="info" />
      <Box x={20} y={160} w={200} h={50} title="03 · traffic generator" sub="every 15 min, 08–22 h" tone="info" />
      <Box x={20} y={230} w={200} h={50} title="04 · daily report" sub="every day at 08:00" tone="info" />
      <Box x={20} y={300} w={200} h={50} title="99 · error handler" sub="any workflow fails" tone="bad" />

      <Box x={300} y={50} w={210} h={64} title="00 · create ticket" sub="validate · retry ×3" sub2="alert if the API is down" tone="gov" />
      <Arrow id={id} d="M220 45 L298 72" />
      <Arrow id={id} d="M220 115 L298 92" />

      <Label x={600} y={40} anchor="start" size={10} tone="faint">AGENTDESK API</Label>
      <Box x={600} y={62} w={170} h={40} title="POST /tickets" />
      <Box x={600} y={165} w={170} h={40} title="POST /simulate" />
      <Box x={600} y={235} w={170} h={40} title="GET /stats" />
      <Arrow id={id} d="M510 82 L598 82" />
      <Arrow id={id} d="M220 185 L598 185" />
      <Arrow id={id} d="M220 255 L598 255" both />

      <Box x={830} y={62} w={150} h={213} title="agentdesk" sub="queue · agents" sub2="guards · approvals" tone="agent" />
      <Arrow id={id} d="M770 82 L828 82" />
      <Arrow id={id} d="M770 185 L828 185" />
      <Arrow id={id} d="M828 255 L772 255" />

      <Box x={300} y={305} w={210} h={44} title="Telegram" sub="alerts and the daily report" tone="human" />
      <Arrow id={id} d="M405 114 L405 303" dashed tone="warn" />
      <Label x={412} y={210} anchor="start">API down after 3 tries</Label>
      <Arrow id={id} d="M120 280 C 120 300, 200 327, 298 327" tone="ink" />
      <Arrow id={id} d="M220 330 L298 330" tone="bad" />
    </Diagram>
  );
}

/** Where each kind of record goes, and which question it answers. */
export function ObservabilityMap() {
  const id = "obs";
  return (
    <Diagram id={id} w={1000} h={300} label="Where observability data goes">
      <Box x={20} y={110} w={170} h={80} title="Worker + agents" sub="every run, step," sub2="decision and failure" tone="agent" />

      <Box x={250} y={20} w={190} h={50} title="runs, run_steps" sub="Postgres, as it happens" tone="data" />
      <Box x={490} y={20} w={190} h={50} title="Supabase Realtime" sub="pushes each change" tone="data" />
      <Box x={730} y={20} w={250} h={50} title="This dashboard" sub="is it healthy right now?" tone="info" />

      <Box x={250} y={125} w={190} h={50} title="Langfuse" sub="one trace per ticket" tone="info" />
      <Box x={490} y={125} w={490} h={50} title="Why did it do that?" sub="prompt, tool results, answer, tokens, cost, provider" tone="muted" />

      <Box x={250} y={230} w={190} h={50} title="audit_log" sub="append-only" tone="data" />
      <Box x={490} y={230} w={190} h={50} title="Telegram" sub="alerts, cards, report" tone="human" />
      <Box x={730} y={230} w={250} h={50} title="Who decided what, when?" sub="Audit log page" tone="muted" />

      <Arrow id={id} d="M190 130 L248 50" />
      <Arrow id={id} d="M190 150 L248 150" />
      <Arrow id={id} d="M190 170 L248 252" />
      <Arrow id={id} d="M440 45 L488 45" />
      <Arrow id={id} d="M680 45 L728 45" />
      <Arrow id={id} d="M440 150 L488 150" />
      <Arrow id={id} d="M440 255 L488 255" />
      <Arrow id={id} d="M680 255 L728 255" />
    </Diagram>
  );
}
