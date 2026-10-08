// What the person in the loop sees and can do. A static replica of the approval card,
// so the explanation does not depend on there being something pending right now.

const OPTIONS: [string, string, string][] = [
  ["Approve", "ok", "The executor locks the proposal, re-checks it against the database (order still yours, amount still available) and only then sends or refunds. Recorded with your name."],
  ["Reject", "muted", "Nothing is sent and no money moves. The proposal is closed as rejected, with your name, and the ticket closes once nothing is pending."],
  ["Do nothing", "faint", "It waits. Nothing expires into an action: pending stays pending, it is on the Approvals page, in the morning report and, past the hourly budget, in a Telegram digest."],
];

export default function HumanLoop() {
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="rounded-md bg-warn/10 px-1.5 py-0.5 text-[11px] font-medium text-warn">Refund · tier 3</span>
          <span className="text-xs text-faint">2m ago</span>
        </div>
        <div className="mt-3 text-xs text-faint">eval.bruno@example.com · email</div>
        <p className="mt-1 text-sm text-muted">“El pedido ORD-90003 ha llegado roto, la lámpara está rota. Inaceptable.”</p>
        <div className="mt-3 rounded-lg bg-ink/[0.03] px-3 py-2 text-sm">
          <span className="text-muted">ORD-90003</span>
          <span className="float-right font-semibold tabular-nums">€129.00</span>
          <div className="text-xs text-faint">damaged item</div>
        </div>
        <div className="mt-4 flex gap-2">
          <span className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-canvas">Approve</span>
          <span className="rounded-md border border-line-strong px-3 py-1.5 text-xs">Reject</span>
        </div>
        <p className="mt-3 text-[11px] text-faint">The same card arrives in Telegram with ✓ Approve / ✗ Reject buttons.</p>
      </div>
      <div className="space-y-3">
        {OPTIONS.map(([title, tone, body]) => (
          <div key={title} className="rounded-xl border border-line bg-panel p-4">
            <h3 className={`text-sm font-semibold ${tone === "ok" ? "text-ok" : tone === "faint" ? "text-faint" : "text-ink"}`}>{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
        <p className="text-sm leading-relaxed text-muted">
          A ⚑ flag on the card (possible prompt injection, a promise of a date, the agent asking for a person) does not block
          anything: it tells you this one deserves a closer read.
        </p>
      </div>
    </div>
  );
}
