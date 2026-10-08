import type { Metadata } from "next";
import { EvalPipeline } from "@/components/diagrams/evals";
import { Figure } from "@/components/diagrams/kit";
import Evaluations from "@/components/info/Evaluations";
import InfoPage from "@/components/info/InfoPage";
import { Section } from "@/components/info/parts";
import { Suspense } from "react";

export const metadata: Metadata = { title: "Quality" };

const TOC = [
  { id: "evals", label: "Evaluations" },
];

export default function Page() {
  return (
    <InfoPage href="/info/quality" toc={TOC}>
      <Section
        id="evals"
        number="01"
        title="Evaluations"
        lead="How we know the agents still behave after any change: tickets with known right answers, run through the real system, scored, and enforced in CI."
        plain={
          <>
            Like an exam with an answer key. Twelve customer messages whose right handling we know in advance, including
            six traps (another customer&apos;s order, a hidden “ignore your instructions”, an inflated refund). Every change to the
            code or a prompt has to pass the exam before it can go live.
          </>
        }
      >
        <Figure caption="Each case runs through the real agents, is checked twice (exact assertions and a judge), and the gate decides whether the change may be merged. Every result is stored and compared.">
          <EvalPipeline />
        </Figure>
        <Suspense fallback={<p className="text-sm text-faint">Loading the suite…</p>}>
          <Evaluations />
        </Suspense>
      </Section>
    </InfoPage>
  );
}
