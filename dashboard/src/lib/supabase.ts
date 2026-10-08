import { createClient } from "@supabase/supabase-js";

// Anonymous, read-only client: row level security lets it read platform tables
// (runs, jobs, proposals…) and nothing from the store.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export type Kpis = {
  tickets_24h: number;
  runs_ok_24h: number;
  runs_failed_24h: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  cost_24h_usd: number;
  queue_depth: number;
  jobs_running: number;
  dead_letters: number;
  pending_approvals: number;
  fallbacks_24h: number;
  guard_blocks_24h: number;
};

export type RunStatus = "running" | "succeeded" | "failed";

export type Run = {
  id: string;
  ticket_id: string | null;
  agent_id: string;
  status: RunStatus;
  provider: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number | null;
  error: string | null;
  error_kind: string | null;
  trace_url: string | null;
  started_at: string;
  tickets: { subject: string | null; channel: string; intent: string | null; body: string } | null;
};

export type Step = {
  id: number;
  seq: number;
  kind: string;
  name: string;
  status: "ok" | "error" | "blocked";
  input: unknown;
  output: unknown;
  latency_ms: number | null;
};

export type Proposal = {
  id: string;
  kind: "send_reply" | "refund";
  tier: number;
  status: string;
  payload: { body?: string; summary?: string; order_id?: string; amount_cents?: number; reason?: string };
  flags: string[];
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  tickets: { customer_email: string; channel: string; body: string; language: string | null } | null;
};

export type Job = {
  id: number;
  kind: string;
  status: "queued" | "running" | "done" | "dead";
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  run_after: string;
  updated_at: string;
  locked_by: string | null;
};

export type Health = {
  provider: string;
  state: "closed" | "open" | "half_open";
  consecutive_failures: number;
  last_error: string | null;
};

export type Chaos = { provider: string; fail: boolean };

export type AuditEntry = {
  id: number;
  at: string;
  actor: string;
  action: string;
  subject: string | null;
  detail: Record<string, unknown>;
};

export type MinuteBucket = { minute: string; succeeded: number; failed: number; avg_latency_ms: number };

export type AgentStat = {
  id: string;
  name: string;
  owner: string;
  tier: number;
  tools: string[];
  description: string;
  active: boolean;
  runs_24h: number;
  failed_24h: number;
  p50_latency_ms: number;
  cost_24h_usd: number;
  last_run_at: string | null;
};
