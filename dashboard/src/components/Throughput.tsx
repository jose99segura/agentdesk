import type { MinuteBucket } from "@/lib/supabase";
import { clock } from "@/lib/format";

// Stacked bars per minute: succeeded runs below, failed above. Plain SVG, no chart library.
export default function Throughput({ data }: { data: MinuteBucket[] }) {
  const W = 600;
  const H = 120;
  const max = Math.max(1, ...data.map((d) => d.succeeded + d.failed));
  const bw = W / Math.max(1, data.length);
  const total = data.reduce((s, d) => s + d.succeeded + d.failed, 0);
  const failed = data.reduce((s, d) => s + d.failed, 0);

  return (
    <div className="px-4 pb-4 pt-3">
      <div className="mb-3 flex gap-6 text-xs">
        <span className="text-muted">
          <span className="text-lg font-semibold tabular-nums text-ink">{total}</span> runs in the last hour
        </span>
        <span className="flex items-center gap-1.5 text-faint">
          <span className="h-2 w-2 rounded-sm bg-ok/80" /> succeeded
        </span>
        <span className="flex items-center gap-1.5 text-faint">
          <span className="h-2 w-2 rounded-sm bg-bad/80" /> failed ({failed})
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label="Runs per minute">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="color-mix(in srgb, var(--ink) 5%, transparent)" />
        ))}
        {data.map((d, i) => {
          const ok = (d.succeeded / max) * (H - 4);
          const bad = (d.failed / max) * (H - 4);
          return (
            <g key={d.minute}>
              <title>{`${clock(d.minute)} · ${d.succeeded} ok, ${d.failed} failed`}</title>
              <rect x={i * bw + 1} y={H - ok} width={bw - 2} height={ok} rx="1.5" className="fill-ok/70" />
              <rect x={i * bw + 1} y={H - ok - bad} width={bw - 2} height={bad} rx="1.5" className="fill-bad/80" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>{data[0] ? clock(data[0].minute).slice(0, 5) : ""}</span>
        <span>now</span>
      </div>
    </div>
  );
}
