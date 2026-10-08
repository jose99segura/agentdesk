// The three states of a provider's circuit breaker and what moves between them.

export default function BreakerDiagram() {
  const node = (x: number, label: string, sub: string, color: string) => (
    <g>
      <rect x={x} y="30" width="160" height="56" rx="28" fill="var(--panel-2)" stroke={color} />
      <text x={x + 80} y="55" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--ink)">{label}</text>
      <text x={x + 80} y="72" textAnchor="middle" fontSize="11" fill="var(--muted)">{sub}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 700 140" className="mt-3 w-full" role="img" aria-label="Circuit breaker states">
      <defs>
        <marker id="bh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M1 1L9 5L1 9" fill="none" stroke="color-mix(in srgb, var(--ink) 55%, transparent)" strokeWidth="1.5" />
        </marker>
      </defs>
      {node(20, "Closed", "calls go through", "var(--ok)")}
      {node(270, "Open", "calls skip it", "var(--bad)")}
      {node(520, "Half open", "one probe call", "var(--warn)")}
      <path d="M180 50 L268 50" stroke="color-mix(in srgb, var(--ink) 40%, transparent)" fill="none" markerEnd="url(#bh)" />
      <text x="224" y="42" textAnchor="middle" fontSize="11" fill="var(--muted)">3 failures</text>
      <path d="M430 50 L518 50" stroke="color-mix(in srgb, var(--ink) 40%, transparent)" fill="none" markerEnd="url(#bh)" />
      <text x="474" y="42" textAnchor="middle" fontSize="11" fill="var(--muted)">after 30s</text>
      <path d="M520 72 L432 72" stroke="color-mix(in srgb, var(--ink) 40%, transparent)" fill="none" markerEnd="url(#bh)" />
      <text x="476" y="90" textAnchor="middle" fontSize="11" fill="var(--muted)">probe fails</text>
      <path d="M600 86 C600 130, 100 130, 100 88" stroke="color-mix(in srgb, var(--ink) 40%, transparent)" fill="none" markerEnd="url(#bh)" />
      <text x="350" y="125" textAnchor="middle" fontSize="11" fill="var(--muted)">probe succeeds</text>
    </svg>
  );
}
