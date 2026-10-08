import { Arrow, Box, Diagram, Label } from "./kit";

type AgentKind = "triage" | "resolver";

const AGENTS = {
  triage: {
    title: "Triage agent",
    job: "classify the ticket",
    tier: "tier 0 · one forced call",
    output: ["submit_triage", "intent, language", "urgency, summary"],
    tools: [] as string[],
  },
  resolver: {
    title: "Resolver agent",
    job: "look things up, draft a reply",
    tier: "tier 1 · up to 6 rounds",
    output: ["submit_resolution", "reply, refund?", "needs_human, summary"],
    tools: ["get_customer", "list_orders", "get_order"],
  },
};

/** What goes into an agent, what it may use, and what must come out. */
export function AgentAnatomy({ kind }: { kind: AgentKind }) {
  const a = AGENTS[kind];
  const id = `anat-${kind}`;
  return (
    <Diagram id={id} w={1000} h={336} label={`Anatomy of the ${a.title}`}>
      <Box x={380} y={14} w={240} h={52} title="Model" sub="Mistral → Claude → offline" tone="plain" />
      <Arrow id={id} d="M500 68 L500 108" both />

      <Box x={20} y={120} w={210} h={74} title={kind === "triage" ? "Ticket" : "Ticket + triage"} sub="sender, channel, subject" sub2="the customer's message" tone="data" />
      <Arrow id={id} d="M230 157 L298 157" />

      <Box x={300} y={110} w={400} h={94} title={a.title} sub={`job: ${a.job}`} sub2={a.tier} tone="agent" size={15} />
      <Label x={500} y={128} tone="faint" size={10}>SYSTEM PROMPT + USER MESSAGE</Label>

      <Arrow id={id} d="M700 157 L778 157" tone="ok" />
      <Box x={780} y={115} w={200} h={84} title={a.output[0]} sub={a.output[1]} sub2={a.output[2]} tone="ok" />
      <Label x={880} y={214} size={10} tone="faint">VALIDATED AGAINST A SCHEMA</Label>

      {a.tools.length === 0 ? (
        <Box x={300} y={250} w={400} h={56} title="No tools" sub="it cannot look anything up: it only reads the ticket" tone="muted" />
      ) : (
        <>
          <Label x={500} y={326} size={10} tone="faint">TOOLS, THROUGH THE GATEWAY · READ-ONLY · SENDER ONLY</Label>
          {a.tools.map((t, i) => {
            const x = 300 + i * 137;
            return (
              <g key={t}>
                <Box x={x} y={250} w={126} h={52} title={t} tone="gov" size={12} />
                <Arrow id={id} d={`M${x + 63} 206 L${x + 63} 248`} both />
              </g>
            );
          })}
        </>
      )}
    </Diagram>
  );
}

/** The resolver's loop: model calls and tool calls until a valid resolution. */
export function ResolverLoop() {
  const id = "loop";
  return (
    <Diagram id={id} w={1000} h={290} label="The resolver's tool loop">
      <Box x={20} y={110} w={150} h={56} title="Ticket + triage" tone="data" />
      <Arrow id={id} d="M170 138 L218 138" />
      <Box x={220} y={110} w={150} h={56} title="Model call" sub="sees all results so far" tone="agent" />
      <Arrow id={id} d="M370 138 L418 138" />
      <Box x={420} y={110} w={170} h={56} title="What came back?" tone="plain" />

      <Arrow id={id} d="M505 110 L505 68" tone="brand" />
      <Label x={512} y={93} anchor="start">tool calls</Label>
      <Box x={420} y={14} w={170} h={52} title="Gateway runs them" sub="granted tools only" tone="gov" />
      <Arrow id={id} d="M420 40 L295 40 L295 108" tone="brand" />
      <Label x={358} y={33}>results go back</Label>

      <Arrow id={id} d="M590 138 L638 138" tone="ok" />
      <Label x={614} y={130}>answer</Label>
      <Box x={640} y={110} w={150} h={56} title="Schema valid?" sub="submit_resolution" tone="plain" />
      <Arrow id={id} d="M790 138 L838 138" tone="ok" />
      <Label x={814} y={130}>yes</Label>
      <Box x={840} y={110} w={140} h={56} title="Draft ready" sub="→ guards" tone="ok" />

      <Arrow id={id} d="M715 166 L715 206" tone="warn" />
      <Label x={722} y={190} anchor="start">no</Label>
      <Box x={640} y={208} w={150} h={50} title="One repair turn" sub="the error goes back" tone="warn" />
      <Arrow id={id} d="M640 233 L295 233 L295 168" tone="warn" />

      <Label x={20} y={278} anchor="start" size={12} tone="ink">
        At most 6 rounds. The last round offers only submit_resolution and forces it, so the loop always ends.
      </Label>
    </Diagram>
  );
}

/** One model call, from the first provider to a job retry. */
export function ModelFallback() {
  const id = "fb";
  const p = (x: number, title: string, sub: string) => (
    <Box x={x} y={50} w={180} h={64} title={title} sub={sub} sub2="2 attempts, backoff" tone="plain" />
  );
  return (
    <Diagram id={id} w={1000} h={250} label="Model fallback chain">
      {p(20, "Mistral", "mistral-small")}
      {p(260, "Claude", "claude-haiku-4-5")}
      {p(500, "offline", "deterministic stand-in")}
      <Box x={740} y={50} w={240} h={64} title="Every provider failed" sub="the job is retried 5s, 10s, 20s" sub2="then the dead letter queue" tone="bad" />
      {[200, 440, 680].map((x) => (
        <g key={x}>
          <Arrow id={id} d={`M${x} 82 L${x + 58} 82`} tone="bad" />
          <Label x={x + 29} y={74}>fails</Label>
        </g>
      ))}
      <Box x={20} y={170} w={660} h={40} title="The first provider that answers is used, and the run records which one" tone="ok" size={12} />
      {[110, 350, 590].map((x) => <Arrow key={x} id={id} d={`M${x} 114 L${x} 168`} tone="ok" />)}
      <Label x={20} y={238} anchor="start" size={11}>
        A provider with an open circuit is skipped without calling it: three failures open it for 30 s, then one probe call decides.
      </Label>
    </Diagram>
  );
}
