"use client";

import { useState, useTransition } from "react";
import { decideProposal } from "@/app/actions";
import { ago, eur, humanize } from "@/lib/format";
import type { Proposal } from "@/lib/supabase";
import { Badge, Button } from "./ui";

export default function ApprovalCard({ p }: { p: Proposal }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (approve: boolean) =>
    start(async () => {
      const r = await decideProposal(p.id, approve);
      setError(r.ok ? null : r.error);
    });

  return (
    <article className="flex flex-col rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge tone={p.kind === "refund" ? "warn" : "info"}>
          {p.kind === "refund" ? "Refund" : "Send reply"} · tier {p.tier}
        </Badge>
        <span className="text-xs text-faint">{ago(p.created_at)}</span>
      </div>
      <div className="mt-3 text-xs text-faint">
        {p.tickets?.customer_email} · {p.tickets?.channel}
      </div>
      <blockquote className="mt-1 line-clamp-3 text-sm text-muted">“{p.tickets?.body}”</blockquote>

      {p.kind === "refund" ? (
        <div className="mt-3 rounded-lg bg-ink/[0.03] px-3 py-2 text-sm">
          <span className="text-muted">{p.payload.order_id}</span>
          <span className="float-right font-semibold tabular-nums">{eur(p.payload.amount_cents)}</span>
          <div className="text-xs text-faint">{p.payload.reason}</div>
        </div>
      ) : (
        <details className="mt-3 rounded-lg bg-ink/[0.03] px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted">Drafted reply</summary>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink">{p.payload.body}</p>
        </details>
      )}

      {p.flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {p.flags.map((f) => (
            <Badge key={f} tone="bad">⚑ {humanize(f)}</Badge>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-warn">{error}</p>}
      <div className="mt-auto flex gap-2 pt-4">
        <Button variant="primary" disabled={pending} onClick={() => decide(true)}>
          Approve
        </Button>
        <Button disabled={pending} onClick={() => decide(false)}>
          Reject
        </Button>
      </div>
    </article>
  );
}
