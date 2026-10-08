"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { setChaos } from "@/app/actions";
import { supabase, type Chaos, type Health, type Kpis } from "@/lib/supabase";
import ThemeToggle from "./ThemeToggle";
import { Dot } from "./ui";
import { useLive, useLiveQuery } from "./live";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/runs", label: "Runs" },
  { href: "/approvals", label: "Approvals", count: "pending_approvals" as const },
  { href: "/queue", label: "Queue", count: "dead_letters" as const },
  { href: "/agents", label: "Agents" },
  { href: "/evals", label: "Evals" },
  { href: "/audit", label: "Audit log" },
];

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { connected } = useLive();
  const kpis = useLiveQuery(
    () => supabase.from("dashboard_kpis").select("*").single().then((r) => r.data as Kpis | null),
    null,
  );

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
        <Link href="/" className="px-2">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand/15 text-xs font-bold text-brand">a</span>
            <span className="font-semibold tracking-tight">agentdesk</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-faint">Governed support agents</p>
        </Link>
        <nav className="mt-8 flex flex-col gap-0.5">
          {NAV.map((item) => {
            const count = item.count && kpis ? kpis[item.count] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  active(item.href) ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03] hover:text-ink"
                }`}
              >
                {item.label}
                {count > 0 && (
                  <span className={`rounded px-1.5 text-[11px] tabular-nums ${item.count === "dead_letters" ? "bg-bad/15 text-bad" : "bg-ink/10 text-ink"}`}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <Link
            href="/info"
            className={`rounded-md px-2 py-1.5 text-sm transition-colors ${active("/info") ? "bg-ink/[0.06] text-ink" : "text-muted hover:text-ink"}`}
          >
            How it works
          </Link>
          <div className="flex items-center gap-2 px-2 text-xs text-faint">
            <Dot tone={connected ? "ok" : "default"} pulse={connected} />
            {connected ? "Live" : "Connecting…"}
          </div>
          <p className="px-2 text-[11px] leading-snug text-faint">Demo store with simulated customers. Platform, models and approvals are real.</p>
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

function TopBar() {
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const health = useLiveQuery(
    () => supabase.from("provider_health").select("*").order("provider").then((r) => (r.data as Health[]) ?? []),
    [],
  );
  const chaos = useLiveQuery(
    () => supabase.from("chaos").select("provider, fail").then((r) => (r.data as Chaos[]) ?? []),
    [],
  );
  const failing = new Set(chaos.filter((c) => c.fail).map((c) => c.provider));

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 py-2.5 backdrop-blur sm:px-8">
      <nav className="flex gap-3 text-sm md:hidden">
        {[...NAV, { href: "/info", label: "Info" }].map((n) => (
          <Link key={n.href} href={n.href} className={pathname === n.href ? "text-ink" : "text-faint"}>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="hidden text-xs text-faint md:block">Model providers</div>
      <div className="flex flex-wrap items-center gap-2">
        {health.map((h) => {
          const tone = h.state === "closed" ? "ok" : h.state === "half_open" ? "warn" : "bad";
          const label = h.state === "closed" ? "healthy" : h.state === "half_open" ? "probing" : "circuit open";
          const down = failing.has(h.provider);
          return (
            <div key={h.provider} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1 text-xs" title={h.last_error ?? undefined}>
              <Dot tone={tone} />
              <span className="font-medium">{h.provider}</span>
              <span className="text-faint">{label}</span>
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await setChaos(h.provider, !down);
                    setError(r.ok ? null : r.error);
                  })
                }
                className={`ml-1 rounded px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
                  down ? "bg-bad/15 text-bad hover:bg-bad/25" : "text-faint hover:bg-ink/5 hover:text-ink"
                }`}
              >
                {down ? "restore" : "simulate outage"}
              </button>
            </div>
          );
        })}
        {error && <span className="text-xs text-warn">{error}</span>}
      </div>
    </header>
  );
}
