// The system on one page. Hand-placed SVG so every arrow means something.

type BoxProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  sub2?: string;
  tone?: "plain" | "gov" | "human" | "muted";
};

const TONES = {
  plain: { fill: "var(--panel-2)", stroke: "color-mix(in srgb, var(--ink) 12%, transparent)", title: "var(--ink)" },
  gov: { fill: "color-mix(in srgb, var(--brand) 10%, transparent)", stroke: "color-mix(in srgb, var(--brand) 45%, transparent)", title: "var(--brand-ink)" },
  human: { fill: "color-mix(in srgb, var(--warn) 8%, transparent)", stroke: "color-mix(in srgb, var(--warn) 45%, transparent)", title: "var(--warn-ink)" },
  muted: { fill: "transparent", stroke: "color-mix(in srgb, var(--ink) 12%, transparent)", title: "var(--muted)" },
};

function Box({ x, y, w, h, title, sub, sub2, tone = "plain" }: BoxProps) {
  const t = TONES[tone];
  const cx = x + w / 2;
  const lines = [sub, sub2].filter(Boolean).length;
  const ty = y + h / 2 - lines * 7 + 4;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={t.fill} stroke={t.stroke} strokeDasharray={tone === "muted" ? "4 4" : undefined} />
      <text x={cx} y={ty} textAnchor="middle" fontSize="13" fontWeight="600" fill={t.title}>
        {title}
      </text>
      {sub && (
        <text x={cx} y={ty + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">
          {sub}
        </text>
      )}
      {sub2 && (
        <text x={cx} y={ty + 30} textAnchor="middle" fontSize="11" fill="var(--muted)">
          {sub2}
        </text>
      )}
    </g>
  );
}

function Arrow({ d, dashed = false }: { d: string; dashed?: boolean }) {
  return <path d={d} fill="none" stroke="color-mix(in srgb, var(--ink) 35%, transparent)" strokeWidth="1.25" strokeDasharray={dashed ? "4 4" : undefined} markerEnd="url(#head)" />;
}

export default function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 1000 500" className="w-full" role="img" aria-label="agentdesk architecture">
      <defs>
        <marker id="head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1L9 5L1 9" fill="none" stroke="color-mix(in srgb, var(--ink) 55%, transparent)" strokeWidth="1.5" strokeLinecap="round" />
        </marker>
      </defs>

      {/* Channels */}
      <text x="20" y="38" fontSize="11" fill="var(--faint)" letterSpacing="0.08em">CHANNELS</text>
      <Box x={20} y={50} w={150} h={36} title="Email · chat · form" />
      <Box x={20} y={98} w={150} h={36} title="Simulator" />
      <Box x={20} y={146} w={150} h={36} title="Voice (ElevenLabs)" tone="muted" />
      <Box x={20} y={194} w={150} h={36} title="n8n workflows" tone="muted" />
      <Arrow d="M170 68 L218 140" />
      <Arrow d="M170 116 L218 142" />
      <Arrow d="M170 164 L218 146" dashed />
      <Arrow d="M170 212 L218 148" dashed />

      {/* Ingest and queue */}
      <Box x={220} y={110} w={150} h={70} title="API" sub="FastAPI, bearer token" sub2="idempotent ingest" />
      <Arrow d="M370 145 L418 145" />
      <Box x={420} y={110} w={150} h={70} title="Job queue" sub="Postgres, SKIP LOCKED" sub2="backoff · dead letters" />
      <Arrow d="M570 145 L618 145" />

      {/* Worker */}
      <rect x="620" y="30" width="360" height="250" rx="12" fill="color-mix(in srgb, var(--ink) 1.5%, transparent)" stroke="color-mix(in srgb, var(--ink) 10%, transparent)" strokeDasharray="5 5" />
      <text x="636" y="50" fontSize="11" fill="var(--faint)" letterSpacing="0.08em">WORKER · role desk_agent</text>
      <Box x={640} y={62} w={150} h={50} title="Triage agent" sub="tier 0 · no tools" />
      <Box x={810} y={62} w={150} h={50} title="Resolver agent" sub="tier 1 · 3 tools" />
      <Arrow d="M790 87 L808 87" />
      <Box x={640} y={135} w={150} h={62} title="Model router" sub="Mistral → Claude → offline" sub2="retry · breaker" />
      <Box x={810} y={135} w={150} h={62} title="Tool gateway" sub="granted tools only" sub2="bound to the sender" tone="gov" />
      <Arrow d="M715 112 L715 133" />
      <Arrow d="M885 112 L885 133" />
      <Arrow d="M840 112 L760 133" />
      <Box x={640} y={215} w={320} h={46} title="Guards" sub="invented orders · refund limits · leaked data · injection" tone="gov" />

      {/* Decision path */}
      <Arrow d="M885 261 L885 328" />
      <Box x={810} y={330} w={150} h={62} title="Proposals" sub="written atomically" sub2="nothing executed yet" />
      <Arrow d="M810 361 L772 361" />
      <Box x={600} y={330} w={170} h={62} title="Human decision" sub="dashboard · Telegram" sub2="approve or reject" tone="human" />
      <Arrow d="M600 361 L562 361" />
      <Box x={400} y={330} w={160} h={62} title="Approval executor" sub="role desk_api" sub2="re-validates in the db" tone="gov" />
      <Arrow d="M400 361 L362 361" />
      <Box x={200} y={330} w={160} h={62} title="Store" sub="refunds · outbound" sub2="messages" />

      {/* Observability */}
      <rect x="20" y="420" width="960" height="56" rx="10" fill="color-mix(in srgb, var(--info) 6%, transparent)" stroke="color-mix(in srgb, var(--info) 35%, transparent)" />
      <text x="40" y="444" fontSize="13" fontWeight="600" fill="var(--info-ink)">Observability</text>
      <text x="40" y="462" fontSize="11" fill="var(--muted)">
        Every step → run_steps → Supabase Realtime → this dashboard · every model and tool call → Langfuse · every decision → audit log · alerts → Telegram
      </text>

      {/* Legend */}
      <g fontSize="11" fill="var(--muted)">
        <rect x="20" y="262" width="10" height="10" rx="2" fill="color-mix(in srgb, var(--brand) 25%, transparent)" stroke="color-mix(in srgb, var(--brand) 60%, transparent)" />
        <text x="36" y="271">enforces governance</text>
        <rect x="20" y="282" width="10" height="10" rx="2" fill="color-mix(in srgb, var(--warn) 20%, transparent)" stroke="color-mix(in srgb, var(--warn) 60%, transparent)" />
        <text x="36" y="291">human in the loop</text>
        <rect x="20" y="302" width="10" height="10" rx="2" fill="none" stroke="color-mix(in srgb, var(--ink) 30%, transparent)" strokeDasharray="3 3" />
        <text x="36" y="311">planned</text>
      </g>
    </svg>
  );
}
