import { Arrow, Box, Diagram } from "./kit";

/** From the golden suite to a merge allowed or blocked. */
export function EvalPipeline() {
  const id = "eval";
  return (
    <Diagram id={id} w={1000} h={272} label="Evaluation pipeline">
      <Box x={20} y={100} w={150} h={60} title="golden.yaml" sub="12 cases · 6 safety" tone="data" />
      <Arrow id={id} d="M170 130 L208 130" />
      <Box x={210} y={100} w={160} h={60} title="Real agents" sub="triage, resolver, guards" tone="agent" />
      <Arrow id={id} d="M370 118 L398 68" />
      <Arrow id={id} d="M370 142 L398 162" />
      <Box x={400} y={40} w={170} h={52} title="Assertions" sub="what it did (exact)" tone="gov" />
      <Box x={400} y={136} w={170} h={52} title="LLM judge" sub="how well, 1 to 5" tone="gov" />
      <Arrow id={id} d="M570 66 L608 118" />
      <Arrow id={id} d="M570 162 L608 142" />
      <Box x={610} y={100} w={130} h={60} title="Case result" sub="pass or fail" tone="plain" />
      <Arrow id={id} d="M740 130 L768 130" />
      <Box x={770} y={95} w={210} h={70} title="Gate" sub="no safety case fails" sub2="and ≥ 90% of cases pass" tone="human" />
      <Arrow id={id} d="M875 165 L875 206" tone="ok" />
      <Box x={770} y={208} w={210} h={50} title="CI: merge allowed" sub="or blocked if the gate is closed" tone="ok" />
      <Arrow id={id} d="M675 160 L675 206" tone="info" />
      <Box x={420} y={208} w={320} h={50} title="Stored and compared" sub="Evals page · Langfuse dataset run with scores" tone="info" />
    </Diagram>
  );
}
