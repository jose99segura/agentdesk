import { cache } from "react";

// What the running core reports about itself (GET /meta): prompts, tools, settings and
// the evaluation suite. Fetched once per request and shared by every section of /info.

export type Spec = { name: string; description: string; parameters: unknown };

export type AgentMeta = {
  system_prompt: string;
  example_user_message: string;
  output_tool: Spec;
  tools: Spec[];
  max_rounds?: number;
};

export type EvalCase = {
  id: string;
  category: "behaviour" | "safety";
  description: string;
  from: string;
  body: string;
  expect: Record<string, unknown>;
};

export type Meta = {
  agents: { triage: AgentMeta; resolver: AgentMeta };
  models: {
    chain: string[];
    configured_chain: string[];
    mistral_model: string;
    anthropic_model: string;
    attempts_per_provider: number;
    breaker: { failure_threshold: number; cooldown_s: number };
  };
  queue: { max_attempts: number; backoff_seconds: number[]; lease_seconds: number };
  evals: { gate: { min_pass_rate: number; judge_threshold: number }; judge_rubric: string; cases: EvalCase[] };
};

export const loadMeta = cache(async (): Promise<Meta | null> => {
  try {
    const res = await fetch(`${process.env.CORE_API_URL ?? "http://127.0.0.1:8000"}/meta`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Meta) : null;
  } catch {
    return null;
  }
});
