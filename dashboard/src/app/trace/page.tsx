import Link from "next/link";
import { Suspense } from "react";
import TraceList from "@/components/trace/TraceList";
import TraceView, { type Prompts } from "@/components/trace/TraceView";
import { PageHeader } from "@/components/ui";
import { loadMeta } from "@/lib/meta";

// /trace lists recent messages; /trace?id=<ticket> follows one of them end to end.

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function TracePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<p className="text-sm text-faint">Loading…</p>}>
      <Trace searchParams={searchParams} />
    </Suspense>
  );
}

async function Trace({ searchParams }: { searchParams: Search }) {
  const { id } = await searchParams;
  if (typeof id !== "string") {
    return (
      <>
        <PageHeader
          title="Trace"
          description="Pick a message to see its whole journey: intake, queue, agents, model and tool calls, guards, proposals and the human decision."
        />
        <TraceList />
      </>
    );
  }
  const meta = await loadMeta();
  // Prompts and tool lists come from the running core, so the trace shows what the agents were told.
  const prompts: Prompts = {};
  for (const [name, a] of Object.entries(meta?.agents ?? {})) {
    if (a) prompts[name] = { system_prompt: a.system_prompt, tools: a.tools.map((x) => ({ name: x.name, description: x.description })) };
  }
  return (
    <>
      <PageHeader
        title="Trace"
        description="Everything that happened to one message, in order: how it came in, the queue, each agent, every model and tool call, the guards, the proposals and the human decision. Updates live."
        actions={<Link href="/trace" className="text-sm text-info hover:underline">All messages</Link>}
      />
      <TraceView id={id} prompts={prompts} />
    </>
  );
}
