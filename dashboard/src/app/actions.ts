"use server";

// The dashboard never touches the database for writes: every action goes through the
// core API, which owns validation, the audit log and the database role allowed to act.
// There is no login yet, so actions are off unless explicitly enabled (local dev only).

type Result = { ok: true } | { ok: false; error: string };

async function callCore(path: string, body: unknown): Promise<Result> {
  if (process.env.DASHBOARD_ACTIONS_ENABLED !== "true") {
    return { ok: false, error: "Actions are disabled on this deployment." };
  }
  const base = process.env.CORE_API_URL ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CORE_API_TOKEN ?? ""}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.detail ?? `Core API returned ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Core API is not reachable." };
  }
}

export async function decideProposal(id: string, approve: boolean): Promise<Result> {
  return callCore(`/proposals/${encodeURIComponent(id)}/decision`, {
    approve,
    actor: process.env.DASHBOARD_ACTOR ?? "dashboard",
  });
}

export async function retryDeadJob(id: number): Promise<Result> {
  return callCore(`/jobs/${id}/retry`, {});
}

export async function setChaos(provider: string, fail: boolean): Promise<Result> {
  return callCore(`/chaos/${encodeURIComponent(provider)}`, { fail });
}

export type GuideTurn = { role: "user" | "assistant"; content: string };
export type GuideAnswer = {
  answer: string;
  provider: string;
  model: string;
  run_id: string;
  trace_url: string | null;
  cost_usd: number;
  latency_ms: number;
};
export type GuideResult = { ok: true; data: GuideAnswer } | { ok: false; error: string };

/** Ask the explainer agent a question about the platform (core POST /explain). */
export async function askGuide(question: string, history: GuideTurn[]): Promise<GuideResult> {
  if (process.env.DASHBOARD_ACTIONS_ENABLED !== "true") {
    return { ok: false, error: "Asking the guide is off on this deployment." };
  }
  const base = process.env.CORE_API_URL ?? "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${base}/explain`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CORE_API_TOKEN ?? ""}`,
      },
      body: JSON.stringify({ question: question.slice(0, 2000), history: history.slice(-8) }),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.detail ?? `Core API returned ${res.status}` };
    }
    return { ok: true, data: (await res.json()) as GuideAnswer };
  } catch {
    return { ok: false, error: "Core API is not reachable. Start it with `uv run agentdesk api`." };
  }
}
