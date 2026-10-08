"use client";

import { useLiveQuery } from "@/components/live";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { clock, humanize } from "@/lib/format";
import { supabase, type AuditEntry } from "@/lib/supabase";

function actorTone(actor: string) {
  if (actor.startsWith("human:")) return "info" as const;
  if (actor.startsWith("agent:")) return "default" as const;
  return "warn" as const;
}

function summary(e: AuditEntry) {
  const d = e.detail ?? {};
  if (e.action === "executed_refund") return `refund ${d.order_id ?? ""} €${((Number(d.amount_cents) || 0) / 100).toFixed(2)}`;
  if (e.action === "guard_blocked") return `blocked: ${(d.blocked as string[] | undefined)?.join(", ")}`;
  if (e.action === "proposed") return d.refund ? "reply and refund" : "reply";
  if (e.action === "chaos") return `${e.subject} ${d.fail ? "down" : "restored"}`;
  if (e.action === "job_dead") return String(d.error ?? "").slice(0, 80);
  return e.subject ?? "";
}

export default function AuditPage() {
  const entries = useLiveQuery(
    () => supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(100).then((r) => (r.data as AuditEntry[]) ?? []),
    [],
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every consequential decision, by whom: proposals from agents, approvals and rejections from humans (dashboard or Telegram), guard blocks, dead letters and fault injection. Append-only for the agent role."
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line">
              <tr>
                <Th>Time</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line/60">
                  <Td className="whitespace-nowrap font-mono text-xs text-faint">{clock(e.at)}</Td>
                  <Td><Badge tone={actorTone(e.actor)}>{e.actor}</Badge></Td>
                  <Td className="whitespace-nowrap">{humanize(e.action)}</Td>
                  <Td className="max-w-0 w-full"><span className="block truncate text-muted">{summary(e)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
