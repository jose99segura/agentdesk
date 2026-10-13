"use client";

import Link from "next/link";
import { useLiveQuery } from "@/components/live";
import { Card, Empty } from "@/components/ui";
import { ago, humanize } from "@/lib/format";
import { supabase } from "@/lib/supabase";

// Recent messages, newest first; each opens its full trace. (Evaluations create no tickets.)

type Row = { id: string; external_id: string; channel: string; customer_email: string; body: string; intent: string | null; status: string; created_at: string };

const STATUS: Record<string, string> = {
  new: "bg-info/10 text-info",
  triaged: "bg-info/10 text-info",
  awaiting_approval: "bg-warn/10 text-warn",
  resolved: "bg-ok/10 text-ok",
  needs_human: "bg-warn/10 text-warn",
  failed: "bg-bad/10 text-bad",
};

function via(r: Row) {
  if (r.external_id.startsWith("n8n-")) return "store chat via n8n";
  if (r.external_id.startsWith("voice-")) return "phone call";
  if (r.external_id.startsWith("shop-")) return "store chat";
  return r.channel;
}

export default function TraceList() {
  const rows = useLiveQuery(
    () =>
      supabase
        .from("tickets")
        .select("id, external_id, channel, customer_email, body, intent, status, created_at")
        .order("created_at", { ascending: false })
        .limit(40)
        .then((r) => (r.data as Row[]) ?? []),
    [] as Row[],
  );
  const newest = rows[0];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Write in the <Link href="/shop" target="_blank" className="text-info hover:underline">demo store</Link>, then open the
          newest message here and watch it fill in live.
        </p>
        {newest && <Link href={`/trace?id=${newest.id}`} className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-canvas">Open the newest</Link>}
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty>No messages yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/trace?id=${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink/[0.03]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{r.body}</div>
                    <div className="mt-0.5 truncate text-xs text-faint">
                      {r.customer_email} · {via(r)}{r.intent ? ` · ${humanize(r.intent)}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[r.status] ?? "bg-ink/5 text-muted"}`}>
                    {humanize(r.status)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs text-faint">{ago(r.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
