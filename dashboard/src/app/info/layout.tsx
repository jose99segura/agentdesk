import type { Metadata } from "next";
import InfoTabs from "@/components/info/InfoTabs";

export const metadata: Metadata = { title: { default: "How it works", template: "%s · How it works · agentdesk" } };

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">How it works</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Agents that do the work, people who make the calls</h1>
        <p className="mt-2 text-base leading-relaxed text-muted">
          A guide to agentdesk in seven parts. Every part starts with a plain-language summary, then the technical detail.
        </p>
      </header>
      <div className="mt-6">
        <InfoTabs />
      </div>
      <div className="mt-10">{children}</div>
    </div>
  );
}
