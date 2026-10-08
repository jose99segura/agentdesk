import type { Metadata } from "next";
import { Suspense } from "react";
import { Figure } from "@/components/diagrams/kit";
import { DecisionTree } from "@/components/diagrams/paths";
import HumanLoop from "@/components/info/HumanLoop";
import InfoPage from "@/components/info/InfoPage";
import { Section } from "@/components/info/parts";
import Scenarios from "@/components/info/Scenarios";

export const metadata: Metadata = { title: "Paths & examples" };

const TOC = [
  { id: "paths", label: "Every path" },
  { id: "outcomes", label: "Outcomes at a glance" },
  { id: "examples", label: "Worked examples" },
  { id: "human", label: "The person in the loop" },
];

const OUTCOMES: [string, string, string, string][] = [
  ["Information only", "Where is my order, how do I return it, a product question", "One reply to approve", "Sent; nothing else changes"],
  ["Reply + refund", "Damaged item or refund request on a delivered order with money left", "A reply and a refund, as two cards", "Each executed or rejected on its own"],
  ["Needs a decision", "Cancellations, disputes, anything the agent should not decide", "A reply flagged “agent requested human”", "You decide, the agent never does"],
  ["Order not on the account", "Someone else's order, or a wrong number", "A reply that reveals nothing", "Sent; no data leaked anywhere"],
  ["Flagged", "Prompt injection, a promised date", "The same cards with a ⚑ flag", "Read twice; nothing is blocked"],
  ["Blocked", "Invented order, refund above what is left, another customer's data", "Nothing to approve: the ticket comes to you with the reason", "Logged in the audit log; counted on Overview"],
  ["Model down", "A provider times out or errors", "Nothing, usually: another model answers", "If all fail: retried later, then the dead letter queue"],
  ["Re-check fails", "You approve, but the order changed since the agent looked", "The proposal marked failed with the reason", "Nothing executed"],
];

export default function Page() {
  return (
    <InfoPage href="/info/paths" toc={TOC}>
      <Section
        id="paths"
        number="01"
        title="Every path a ticket can take"
        lead="From arrival to an outcome, every branch the agents and the guards can take, and where a person comes in."
        plain={
          <>
            Each message ends in one of a few ways: a simple answer, an answer plus a refund, a question passed to you, or a
            draft stopped by the safety checks. Whatever the path, the last step before anything reaches the customer is you.
          </>
        }
      >
        <Figure caption="Read top to bottom. Blue is the agents, purple the safety checks, amber is you. The red box on the right can happen at any step: if a model is down, another one answers or the ticket is retried later.">
          <DecisionTree />
        </Figure>
      </Section>

      <Section id="outcomes" number="02" title="Outcomes at a glance" lead="The same paths as a table: when each happens, what you see, and what happens next.">
        <div className="overflow-x-auto rounded-xl border border-line bg-panel">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-faint">
              <tr>
                <th className="px-4 py-2.5 font-normal">Path</th>
                <th className="px-4 py-2.5 font-normal">When</th>
                <th className="px-4 py-2.5 font-normal">What you see</th>
                <th className="px-4 py-2.5 font-normal">What happens next</th>
              </tr>
            </thead>
            <tbody>
              {OUTCOMES.map(([path, when, see, next]) => (
                <tr key={path} className="border-b border-line/60 align-top last:border-0">
                  <td className="px-4 py-3 font-semibold">{path}</td>
                  <td className="px-4 py-3 text-muted">{when}</td>
                  <td className="px-4 py-3 text-muted">{see}</td>
                  <td className="px-4 py-3 text-muted">{next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="examples"
        number="03"
        title="Worked examples"
        lead="Six real tickets, step by step: what triage decided, what the resolver looked up, what the guards said, what was proposed, and what you do."
        plain={<>These are not mock-ups: each one is what the system actually produced for that message in an evaluation run.</>}
      >
        <Suspense fallback={<p className="text-sm text-faint">Loading the examples…</p>}>
          <Scenarios />
        </Suspense>
      </Section>

      <Section
        id="human"
        number="04"
        title="The person in the loop"
        lead="What the approval card shows, what each choice does, and what happens if nobody decides."
        plain={<>You are the last step. The agents prepare; you decide. Your decision is re-checked, executed and recorded with your name.</>}
      >
        <HumanLoop />
      </Section>
    </InfoPage>
  );
}
