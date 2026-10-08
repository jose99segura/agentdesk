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
