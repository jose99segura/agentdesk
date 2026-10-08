import type { Metadata } from "next";
import { ModelFallback } from "@/components/diagrams/agents";
import { N8nMap, ObservabilityMap } from "@/components/diagrams/flows";
import { Figure } from "@/components/diagrams/kit";
import { JobStates, ProposalStates } from "@/components/diagrams/states";
import BreakerDiagram from "@/components/info/BreakerDiagram";
import Failures from "@/components/info/Failures";
import InfoPage from "@/components/info/InfoPage";
import LangfuseTour from "@/components/info/LangfuseTour";
import N8nWorkflows from "@/components/info/N8nWorkflows";
import { Section } from "@/components/info/parts";

export const metadata: Metadata = { title: "Operations" };

const TOC = [
  { id: "n8n", label: "Channels in n8n" },
  { id: "langfuse", label: "Tracing in Langfuse" },
  { id: "failures", label: "When things go wrong" },
];

export default function Page() {
  return (
    <InfoPage href="/info/operations" toc={TOC}>
      <Section
        id="n8n"
        number="01"
        title="Channels in n8n"
        lead="n8n owns the edges: how customers reach the platform, the traffic that keeps the demo alive, the morning report and the alarms."
        plain={
          <>
            n8n is a visual automation tool: each box is a step, each line is where the data goes next. It handles the
            outside world (forms, webhooks, schedules, Telegram), and hands the actual work to the platform through its API.
            The agents, their rules and their retries stay in the platform, not in n8n.
          </>
        }
      >
        <Figure caption="How the six workflows fit together: two entry points share one ticket-creating sub-workflow, two schedules talk to the API directly, and every failure ends up on Telegram.">
          <N8nMap />
        </Figure>
        <N8nWorkflows />
      </Section>
      <Section
        id="langfuse"
        number="02"
        title="Tracing in Langfuse"
        lead="Langfuse records what the agents actually did, call by call, so any reply can be explained after the fact."
        plain={
          <>
            The dashboard tells you <em>that</em> something happened; Langfuse tells you <em>why</em>. For any ticket you can
            read exactly what the model was told, what it looked up, what it answered and what it cost.
          </>
        }
      >
        <Figure caption="Three records of the same work, each answering a different question.">
          <ObservabilityMap />
        </Figure>
        <LangfuseTour />
      </Section>
      <Section
        id="failures"
        number="03"
        title="When things go wrong"
        lead="Failures are expected and designed for, in the order a ticket meets them. Try “simulate outage” on the top bar, then watch Runs and Queue."
        plain={
          <>
            Models time out, services go down, workers crash, people click twice. For each of these the system has a planned
            reaction, and each one is visible somewhere you can check.
          </>
        }
      >
        <Figure caption="A model call: providers are tried in order, each twice. Only when all of them fail does the whole job go back to the queue.">
          <ModelFallback />
        </Figure>
        <Figure caption="A job in the queue: every way it can fail leads somewhere visible, and nothing disappears.">
          <JobStates />
        </Figure>
        <Figure caption="A proposal after the agent is done: only a person moves it, and the executor re-checks before acting.">
          <ProposalStates />
        </Figure>
        <Failures />
        <div className="rounded-xl border border-line bg-panel p-5">
          <h3 className="text-sm font-semibold">Circuit breaker, per model provider</h3>
          <BreakerDiagram />
        </div>
      </Section>
    </InfoPage>
  );
}
