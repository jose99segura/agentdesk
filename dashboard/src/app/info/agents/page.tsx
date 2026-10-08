import type { Metadata } from "next";
import { AgentAnatomy, ResolverLoop } from "@/components/diagrams/agents";
import { Figure } from "@/components/diagrams/kit";
import InfoPage from "@/components/info/InfoPage";
import Prompts from "@/components/info/Prompts";
import { Section, Sub } from "@/components/info/parts";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Agents" };

const TOC = [
  { id: "agents", label: "Agents, prompts, tools" },
];

export default function Page() {
  return (
    <InfoPage href="/info/agents" toc={TOC}>
      <Section
        id="agents"
        number="01"
        title="Agents, prompts and tools"
        lead="Exactly what each agent receives, served live by the core API from the code that runs: the system prompt, the shape of the message, and the schema of every tool."
        plain={
          <>
            A prompt is the instruction sheet an agent reads before each ticket. Tools are the only things it can do: look up
            the customer, list their orders, open one order. It answers by filling in a form (a JSON schema) rather than writing
            free text, so the platform can check every field before anyone sees it.
          </>
        }
      >
        <Sub title="The two AI agents">
          <p>
            There are exactly two agents, each a model with one job, its own prompt, its own tools and a fixed output form.
            Neither can act on the outside world: their output is checked, then proposed to a person.
          </p>
        </Sub>
        <Figure caption="Triage reads the ticket and fills one form: what it is about, which language, how urgent. It has no tools, so it cannot look anything up or leak anything.">
          <AgentAnatomy kind="triage" />
        </Figure>
        <Figure caption="The resolver can look up the sender and their orders through the gateway, then fills the resolution form: the reply, and a refund only if one is justified.">
          <AgentAnatomy kind="resolver" />
        </Figure>
        <Figure caption="How the resolver works inside: it asks for data, gets it, asks again if needed, and finishes by submitting its answer. A malformed answer gets one chance to be fixed.">
          <ResolverLoop />
        </Figure>
        <Sub title="Their exact prompts and tools">
          <p>Served live from the code that runs, so this is precisely what each model receives.</p>
        </Sub>
        <Suspense fallback={<p className="text-sm text-faint">Loading the live prompts…</p>}>
          <Prompts />
        </Suspense>
      </Section>
    </InfoPage>
  );
}
