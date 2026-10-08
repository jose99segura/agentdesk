"use client";

import ApprovalCard from "@/components/ApprovalCard";
import { useLiveQuery } from "@/components/live";
import { Badge, Card, Empty, PageHeader, Td, Th } from "@/components/ui";
import { ago, eur } from "@/lib/format";
import { supabase, type Proposal } from "@/lib/supabase";

const SELECT = "*, tickets(customer_email, channel, body, language)";

export default function ApprovalsPage() {
  const pending = useLiveQuery(
    () =>
      supabase
        .from("proposals")
        .select(SELECT)
        .eq("status", "pending")
        .order("tier", { ascending: false })
        .order("created_at")
        .limit(30)
        .then((r) => (r.data as Proposal[]) ?? []),
    [],
  );
  const decided = useLiveQuery(
    () =>
      supabase
        .from("proposals")
        .select(SELECT)
        .neq("status", "pending")
        .order("decided_at", { ascending: false, nullsFirst: false })
        .limit(15)
        .then((r) => (r.data as Proposal[]) ?? []),
    [],
  );

  return (
    <>
      <PageHeader
        title="Approvals"
        description="What agents want to do to the outside world. Tier 2 sends a message to a customer, tier 3 moves money. Approving here or in Telegram runs the same checks against the database before anything executes."
      />
      {pending.length === 0 ? (
        <Card>
          <Empty>Nothing waiting for a decision.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pending.map((p) => (
            <ApprovalCard key={p.id} p={p} />
          ))}
        </div>
      )}

      <Card title="Recently decided" className="mt-8">
        {decided.length === 0 ? (
          <Empty>No decisions yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line">
                <tr>
                  <Th>Proposal</Th>
                  <Th>Customer</Th>
                  <Th>Outcome</Th>
                  <Th>Decided by</Th>
                  <Th right>When</Th>
                </tr>
              </thead>
              <tbody>
                {decided.map((p) => (
                  <tr key={p.id} className="border-b border-line/60">
                    <Td>
                      {p.kind === "refund" ? `Refund ${eur(p.payload.amount_cents)}` : "Send reply"}
                    </Td>
                    <Td className="text-muted">{p.tickets?.customer_email}</Td>
                    <Td>
                      <Badge tone={p.status === "executed" ? "ok" : p.status === "rejected" ? "default" : "bad"}>{p.status}</Badge>
                    </Td>
                    <Td className="text-muted">{p.decided_by ?? "—"}</Td>
                    <Td right className="text-faint">{ago(p.decided_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
