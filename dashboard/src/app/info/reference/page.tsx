import type { Metadata } from "next";
import Glossary from "@/components/info/Glossary";
import InfoPage from "@/components/info/InfoPage";
import Links from "@/components/info/Links";
import { CODE, STACK } from "@/components/info/content";
import { Section, Sub } from "@/components/info/parts";

export const metadata: Metadata = { title: "Reference" };

const TOC = [
  { id: "glossary", label: "Glossary" },
  { id: "code", label: "Stack and code map" },
  { id: "links", label: "Where things live" },
];

export default function Page() {
  return (
    <InfoPage href="/info/reference" toc={TOC}>
      <Section id="glossary" number="01" title="Glossary" lead="The terms used on this page, in one line each.">
        <Glossary />
      </Section>
      <Section id="code" number="02" title="Stack and code map" lead="What it is built with, and where each idea lives in the repository.">
        <dl className="divide-y divide-line rounded-xl border border-line bg-panel">
          {STACK.map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7rem_1fr] gap-4 px-4 py-3 text-sm">
              <dt className="text-faint">{k}</dt>
              <dd className="text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <Sub title="Code map">
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {CODE.map(([path, what]) => (
              <li key={path} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[17rem_1fr] sm:gap-4">
                <span className="font-mono text-xs text-ink">{path}</span>
                <span className="text-sm text-muted">{what}</span>
              </li>
            ))}
          </ul>
        </Sub>
      </Section>
      <Section id="links" number="03" title="Where things live" lead="The n8n folder, the Langfuse project and the local services, one click away.">
        <Links />
      </Section>
    </InfoPage>
  );
}
