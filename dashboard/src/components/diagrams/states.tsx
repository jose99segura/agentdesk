import { Arrow, Box, Diagram, Label, State } from "./kit";

/** The life of a job in the queue, including every failure path. */
export function JobStates() {
  const id = "job";
  return (
    <Diagram id={id} w={1000} h={280} label="Job states in the queue">
      <State x={60} y={100} title="queued" tone="info" />
      <State x={330} y={100} title="running" tone="agent" />
      <State x={640} y={30} title="done" tone="ok" />
      <State x={640} y={170} title="dead" sub="dead letter queue" tone="bad" />

      <Arrow id={id} d="M190 113 L328 113" />
      <Label x={259} y={105}>claimed</Label>
      <Arrow id={id} d="M330 130 L192 130" tone="warn" />
      <Label x={261} y={148}>failed: back off</Label>
      <Label x={261} y={162}>5s · 10s · 20s</Label>
      <Arrow id={id} d="M395 100 C395 48, 125 48, 125 98" tone="warn" dashed />
      <Label x={260} y={54}>lease expired: the worker died</Label>

      <Arrow id={id} d="M460 112 L638 56" tone="ok" />
      <Label x={560} y={72}>succeeded</Label>
      <Arrow id={id} d="M460 130 L638 190" tone="bad" />
      <Label x={560} y={174}>4th failure</Label>

      <Arrow id={id} d="M705 222 C705 262, 125 262, 125 142" tone="brand" />
      <Label x={420} y={258}>a person presses Retry on the Queue page</Label>
      <Label x={790} y={140} anchor="start" size={11}>Claims use FOR UPDATE SKIP LOCKED,</Label>
      <Label x={790} y={155} anchor="start" size={11}>so any number of workers can share</Label>
      <Label x={790} y={170} anchor="start" size={11}>the queue without taking a job twice.</Label>
    </Diagram>
  );
}

/** What can happen to a proposal once an agent has made it. */
export function ProposalStates() {
  const id = "prop";
  return (
    <Diagram id={id} w={1000} h={240} label="Proposal states">
      <State x={40} y={92} w={150} title="pending" sub="waits for a person" tone="human" />
      <State x={560} y={20} w={170} title="executed" sub="refund made, reply sent" tone="ok" />
      <State x={560} y={96} w={170} title="rejected" tone="plain" />
      <State x={560} y={160} w={170} title="failed" sub="nothing executed" tone="bad" />

      <Arrow id={id} d="M190 108 L558 48" tone="ok" />
      <Label x={380} y={66}>approve: lock row, re-check, execute</Label>
      <Arrow id={id} d="M190 118 L558 116" />
      <Label x={380} y={110}>reject</Label>
      <Arrow id={id} d="M190 128 L558 184" tone="bad" />
      <Label x={380} y={168}>approve, but the re-check fails</Label>
      <Label x={380} y={182}>(order changed, already refunded)</Label>

      <Box x={770} y={70} w={210} h={84} title="A second click" sub="from the dashboard or Telegram" sub2="answers “already decided”" tone="muted" />
    </Diagram>
  );
}
