import type { Metadata } from "next";
import { AttackLayers, PermissionMatrix } from "@/components/diagrams/governance";
import { Figure } from "@/components/diagrams/kit";
import InfoPage from "@/components/info/InfoPage";
import { GOVERNANCE } from "@/components/info/content";
import { Section, Sub } from "@/components/info/parts";

export const metadata: Metadata = { title: "Safety" };

const TOC = [
  { id: "governance", label: "Governance" },
];

export default function Page() {
  return (
    <InfoPage href="/info/safety" toc={TOC}>
      <Section
        id="governance"
        number="01"
        title="Governance"
        lead="Five layers, each assuming the one above it failed. The strongest is the database: a prompt can be talked around, a missing permission cannot."
        plain={
          <>
            Telling a model “never refund without approval” is a request, not a guarantee. Here the agents&apos; database login
            simply has no permission to refund, so it cannot happen, whatever the model is tricked into trying.
          </>
        }
      >
        <Figure caption="The same attack meets every layer. The prompt alone could be talked around (dashed); each of the four solid layers would stop it by itself.">
          <AttackLayers />
        </Figure>
        <div className="space-y-2">
          {GOVERNANCE.map(([title, body], i) => (
            <div key={title} className="flex gap-4 rounded-xl border border-line bg-panel p-4" style={{ marginLeft: `${i * 12}px` }}>
              <span className="w-28 shrink-0 text-sm font-semibold text-brand">{title}</span>
              <p className="text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
        <Sub title="Who may touch what">
          <p>The real permissions, table by table. Red is the point of the design: the agents cannot move money or send anything.</p>
        </Sub>
        <PermissionMatrix />
        <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
          {[
            ["0", "Read internal data", "agent"],
            ["1", "Draft for a person", "agent"],
            ["2", "Send to a customer", "a person approves"],
            ["3", "Move money", "a person approves, re-checked"],
          ].map(([tier, label, who]) => (
            <div key={tier} className="bg-panel p-4">
              <div className="text-xs text-faint">Tier {tier}</div>
              <div className="mt-1 text-sm font-semibold">{label}</div>
              <div className="mt-0.5 text-xs text-faint">{who}</div>
            </div>
          ))}
        </div>
      </Section>
    </InfoPage>
  );
}
