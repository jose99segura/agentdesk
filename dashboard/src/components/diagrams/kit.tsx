// A tiny SVG kit so every diagram on /info shares one look and follows the theme.
// Coordinates are in viewBox units; diagrams scale to the width of their container.

import type { ReactNode } from "react";

export type Tone = "plain" | "agent" | "gov" | "human" | "info" | "ok" | "bad" | "warn" | "muted" | "data";

const TONES: Record<Tone, { fill: string; stroke: string; title: string }> = {
  plain: { fill: "var(--panel-2)", stroke: "var(--line-strong)", title: "var(--ink)" },
  data: { fill: "var(--panel)", stroke: "var(--line-strong)", title: "var(--ink)" },
  agent: { fill: "color-mix(in srgb, var(--info) 10%, transparent)", stroke: "color-mix(in srgb, var(--info) 55%, transparent)", title: "var(--info-ink)" },
  gov: { fill: "color-mix(in srgb, var(--brand) 10%, transparent)", stroke: "color-mix(in srgb, var(--brand) 55%, transparent)", title: "var(--brand-ink)" },
  human: { fill: "color-mix(in srgb, var(--warn) 10%, transparent)", stroke: "color-mix(in srgb, var(--warn) 55%, transparent)", title: "var(--warn-ink)" },
  info: { fill: "color-mix(in srgb, var(--info) 6%, transparent)", stroke: "color-mix(in srgb, var(--info) 40%, transparent)", title: "var(--info-ink)" },
  ok: { fill: "color-mix(in srgb, var(--ok) 10%, transparent)", stroke: "color-mix(in srgb, var(--ok) 55%, transparent)", title: "var(--ok)" },
  bad: { fill: "color-mix(in srgb, var(--bad) 10%, transparent)", stroke: "color-mix(in srgb, var(--bad) 55%, transparent)", title: "var(--bad)" },
  warn: { fill: "color-mix(in srgb, var(--warn) 10%, transparent)", stroke: "color-mix(in srgb, var(--warn) 55%, transparent)", title: "var(--warn)" },
  muted: { fill: "transparent", stroke: "var(--line-strong)", title: "var(--muted)" },
};

export function Diagram({ id, w, h, label, children }: { id: string; w: number; h: number; label: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={label} style={{ fontFamily: "var(--font-geist-sans)" }}>
      <defs>
        {(["ink", "ok", "bad", "warn", "brand", "info"] as const).map((c) => (
          <marker key={c} id={`${id}-${c}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1L9 5L1 9" fill="none" stroke={`var(--${c === "ink" ? "muted" : c})`} strokeWidth="1.6" strokeLinecap="round" />
          </marker>
        ))}
      </defs>
      {children}
    </svg>
  );
}

export function Box({
  x, y, w, h, title, sub, sub2, tone = "plain", rx = 8, dashed = false, size = 14.5,
}: {
  x: number; y: number; w: number; h: number; title: string; sub?: string; sub2?: string;
  tone?: Tone; rx?: number; dashed?: boolean; size?: number;
}) {
  const t = TONES[tone];
  const lines = [sub, sub2].filter(Boolean) as string[];
  const top = y + h / 2 - (lines.length * 16) / 2 + 5;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={t.fill} stroke={t.stroke} strokeDasharray={dashed || tone === "muted" ? "4 4" : undefined} />
      <text x={x + w / 2} y={top} textAnchor="middle" fontSize={size} fontWeight="600" fill={t.title}>{title}</text>
      {lines.map((l, i) => (
        <text key={i} x={x + w / 2} y={top + 17 + i * 16} textAnchor="middle" fontSize="12.5" fill="var(--muted)">{l}</text>
      ))}
    </g>
  );
}

type ArrowTone = "ink" | "ok" | "bad" | "warn" | "brand" | "info";

export function Arrow({ id, d, tone = "ink", dashed = false, both = false }: { id: string; d: string; tone?: ArrowTone; dashed?: boolean; both?: boolean }) {
  const stroke = tone === "ink" ? "color-mix(in srgb, var(--ink) 40%, transparent)" : `var(--${tone})`;
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth="1.4"
      strokeDasharray={dashed ? "5 4" : undefined}
      markerEnd={`url(#${id}-${tone})`}
      markerStart={both ? `url(#${id}-${tone})` : undefined}
    />
  );
}

export function Label({ x, y, children, anchor = "middle", tone = "muted", size = 12.5, weight = 400 }: {
  x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end"; tone?: string; size?: number; weight?: number;
}) {
  return (
    // A halo in the panel colour keeps a label readable where it crosses a line.
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} fill={`var(--${tone})`}
      stroke="var(--panel)" strokeWidth={4} strokeLinejoin="round" paintOrder="stroke">{children}</text>
  );
}

/** A pill-shaped state for state machines. */
export function State({ x, y, w = 130, title, sub, tone = "plain" }: { x: number; y: number; w?: number; title: string; sub?: string; tone?: Tone }) {
  return <Box x={x} y={y} w={w} h={sub ? 52 : 40} rx={sub ? 26 : 20} title={title} sub={sub} tone={tone} />;
}

export function Figure({ children, caption }: { children: ReactNode; caption?: ReactNode }) {
  return (
    <figure className="rounded-xl border border-line bg-panel">
      <div className="p-4">{children}</div>
      {caption && <figcaption className="border-t border-line px-4 py-3 text-sm leading-relaxed text-muted">{caption}</figcaption>}
    </figure>
  );
}
