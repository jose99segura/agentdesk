import { Arrow, Box, Diagram, Label } from "./kit";

/** Every path a ticket can take, from arrival to an outcome. */
export function DecisionTree() {
  const id = "tree";
  const branches: [number, number, string, string, string][] = [
    [20, 215, "Order not on the account", "asks about someone else's", "or a wrong number"],
    [255, 215, "Information only", "where is it, how to return,", "a product question"],
    [490, 235, "Damaged or refund request", "on a delivered order", "with money left to refund"],
    [745, 235, "Needs a decision", "cancel, dispute,", "anything unclear"],
  ];
  const results: [number, number, string, string, "plain" | "ok" | "warn"][] = [
    [20, 215, "Reply: “can't find it”", "nothing about the order", "plain"],
    [255, 215, "Reply proposed", "tier 2", "plain"],
    [490, 235, "Reply + refund proposed", "tier 2 + tier 3", "warn"],
    [745, 235, "Reply proposed, flagged", "“agent requested human”", "warn"],
  ];
  return (
    <Diagram id={id} w={1000} h={640} label="Every path a ticket can take">
      <Box x={410} y={10} w={180} h={42} title="A ticket arrives" tone="data" />
      <Arrow id={id} d="M500 52 L500 76" />
      <Box x={380} y={78} w={240} h={50} title="Triage" sub="intent · language · urgency" tone="agent" />
      <Arrow id={id} d="M500 128 L500 152" />
      <Box x={380} y={154} w={240} h={50} title="Resolver looks it up" sub="the sender and their orders" tone="agent" />

      <Box x={745} y={78} w={235} h={56} title="A model is down?" sub="retry → next model → retry later" tone="bad" />
      <Arrow id={id} d="M620 103 L743 103" tone="bad" dashed />
      <Label x={682} y={96}>any time</Label>

      {branches.map(([x, w, t, s1, s2]) => (
        <g key={t}>
          <Arrow id={id} d={`M500 204 L${x + w / 2} 244`} />
          <Box x={x} y={246} w={w} h={66} title={t} sub={s1} sub2={s2} tone="plain" size={13.5} />
          <Arrow id={id} d={`M${x + w / 2} 312 L${x + w / 2} 338`} />
        </g>
      ))}

      <Box x={20} y={340} w={725} h={44} title="Guards check every draft" sub="invented orders · refund limits · other customers' data · promises · injection" tone="gov" />
      <Arrow id={id} d="M745 362 L778 362" tone="bad" />
      <Box x={780} y={334} w={200} h={56} title="Blocked" sub="nothing proposed → a person" tone="bad" />

      {results.map(([x, w, t, s, tone]) => (
        <g key={t}>
          <Arrow id={id} d={`M${x + w / 2} 384 L${x + w / 2} 408`} tone="ok" />
          <Box x={x} y={410} w={w} h={52} title={t} sub={s} tone={tone} size={13} />
          <Arrow id={id} d={`M${x + w / 2} 462 L${x + w / 2} 486`} tone="warn" />
        </g>
      ))}

      <Box x={20} y={488} w={960} h={44} title="You decide" sub="on the dashboard or with a Telegram button · a ⚑ flag means read it twice" tone="human" />

      <Arrow id={id} d="M150 532 L150 566" tone="ok" />
      <Box x={20} y={568} w={260} h={56} title="Approve → executed" sub="re-checked, then sent or refunded" tone="ok" />
      <Arrow id={id} d="M480 532 L480 566" />
      <Box x={350} y={568} w={260} h={56} title="Reject → nothing happens" sub="the ticket closes without sending" tone="plain" />
      <Arrow id={id} d="M810 532 L810 566" tone="bad" />
      <Box x={680} y={568} w={300} h={56} title="Approve, re-check fails → failed" sub="order changed or already refunded" tone="bad" />
    </Diagram>
  );
}
