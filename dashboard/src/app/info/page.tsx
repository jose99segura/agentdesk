import type { Metadata } from "next";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import { TicketSequence } from "@/components/diagrams/flows";
import { Figure } from "@/components/diagrams/kit";
import InfoPage from "@/components/info/InfoPage";
import Links from "@/components/info/Links";
import ReadingMap from "@/components/info/ReadingMap";
import { LIFECYCLE, TOUR } from "@/components/info/content";
import { Card3, Code, Section } from "@/components/info/parts";
import Link from "next/link";

export const metadata: Metadata = { title: "Overview" };

const TOC = [
  { id: "overview", label: "What it is" },
  { id: "start", label: "Start here" },
  { id: "tour", label: "A two-minute tour" },
  { id: "architecture", label: "Architecture" },
  { id: "ticket", label: "The life of a ticket" },
  { id: "links", label: "Where things live" },
];

export default function Page() {
  return (
    <InfoPage href="/info" toc={TOC}>
      <Section
        id="overview"
        number="01"
        title="What it is"
        lead="A team of AI agents that handles customer support for an online store."
        plain={
          <>
            Customers write in by email, chat or a contact form. The agents read each message, look up the customer and the
            order, and write a reply, and sometimes suggest a refund. They are not allowed to send anything or give money back
            on their own: those actions wait for a person to press Approve. Everything they do is visible live on this
            dashboard and recorded step by step.
          </>
        }
      >
        <Card3
          items={[
            ["Controlled", "Each agent can only use the tools it was given, and its database login cannot refund or send at all."],
            ["Verified", "Every answer is checked by rules before a person sees it, and a test suite of known tickets runs on every change."],
            ["Observable", "Every step is live on this dashboard, every model call is in Langfuse, every decision is in the audit log."],
          ]}
        />
        <p className="text-sm leading-relaxed text-muted">
          The store and its customers are a demo with simulated traffic. Everything else is real: the queue, the models, the
          rules, the approvals from a phone, the tracing and the evaluation that guards every change.
        </p>
      </Section>
      <Section
        id="start"
        number="02"
        title="Start here"
        lead="The guide has seven tabs, written to be read in order. Each one starts in plain words, then goes into the detail."
        plain={
          <>
            In a hurry? Read this tab and <Link href="/info/paths" className="font-medium underline decoration-dotted">Paths &amp; examples</Link>.
            Have a question instead? Press <span className="font-medium">Ask the guide</span> at the bottom right: an agent of this
            platform answers from this guide and from the running code, in your language.
          </>
        }
      >
        <ReadingMap />
      </Section>
      <Section id="tour" number="03" title="A two-minute tour" lead="Where to click, in order, to see the whole system work.">
        <ol className="grid gap-2 sm:grid-cols-2">
          {TOUR.map(([name, href, what], i) => (
            <li key={name}>
              <Link href={href} className="flex h-full gap-3 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong">
                <span className="font-mono text-xs text-faint">{i + 1}</span>
                <span>
                  <span className="text-sm font-semibold">{name}</span>
                  <span className="mt-0.5 block text-sm text-muted">{what}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </Section>
      <Section
        id="architecture"
        number="04"
        title="Architecture"
        lead="One request path from left to right, one decision path along the bottom, and observability under all of it."
        plain={
          <>
            Messages come in on the left and wait in line. A worker hands each one to two agents: the first sorts it, the
            second looks things up and drafts an answer. Purple boxes are the safety rules; the amber box is you. Nothing
            reaches the store on the bottom row without passing through you.
          </>
        }
      >
        <div className="rounded-xl border border-line bg-panel p-4">
          <ArchitectureDiagram />
        </div>
      </Section>
      <Section
        id="ticket"
        number="05"
        title="The life of a ticket"
        lead="What happens between “my order arrived broken” and a refund, and where each step lives in the code."
      >
        <Figure caption="Read top to bottom: each arrow is one message between two parts of the system. Dashed arrows are answers. The amber step is the only one that needs a person.">
          <TicketSequence />
        </Figure>
        <ol className="relative space-y-6 border-l border-line pl-8">
          {LIFECYCLE.map(([title, body, code], i) => (
            <li key={title} className="relative">
              <span className="absolute -left-[45px] grid h-7 w-7 place-items-center rounded-full border border-line-strong bg-panel text-xs font-semibold tabular-nums text-muted">
                {i + 1}
              </span>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              <span className="mt-2 inline-block">
                <Code>{code}</Code>
              </span>
            </li>
          ))}
        </ol>
      </Section>
      <Section
        id="links"
        number="06"
        title="Where things live"
        lead="The pieces outside this dashboard, one click away. “Live” links are the real self-hosted services; “local” ones only answer when the stack runs on your machine."
      >
        <Links />
      </Section>
    </InfoPage>
  );
}
