"use server";

import { headers } from "next/headers";

// The storefront's two calls, both made from the server so no token reaches the browser.
//
// Sending goes through n8n when SHOP_INTAKE_URL is set (production): the message takes the
// same path a real website's chat would, n8n's "01 · intake webhook" workflow, which then
// calls the API. Locally, or if n8n does not answer, it goes straight to the API, and the
// result says which path it took.

export type SendResult =
  | { ok: true; ticketId: string; via: "n8n" | "api" }
  | { ok: false; error: string };

export type TicketView = {
  status: string;
  intent: string | null;
  job: { status: string; attempts: number } | null;
  looked_up: string[];
  agents: string[];
  reply_status: string | null;
  refund: { status: string; amount_cents: number; order_id: string } | null;
  reply: string | null;
};

const CORE = process.env.CORE_API_URL ?? "http://127.0.0.1:8000";
const TOKEN = process.env.CORE_API_TOKEN ?? "";

// A public demo creates real model calls and Telegram cards: keep it to a sane rate.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const recent = new Map<string, number[]>();

function allowed(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) return false;
  hits.push(now);
  recent.set(key, hits);
  return true;
}

export async function sendToSupport(email: string, message: string, order: string | null): Promise<SendResult> {
  if (process.env.SHOP_ENABLED === "false") return { ok: false, error: "The demo shop is closed right now." };
  const text = message.trim().slice(0, 1500);
  if (text.length < 3) return { ok: false, error: "Write a little more so we can help." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowed(ip)) return { ok: false, error: "Too many messages from here. Try again in a few minutes." };

  const id = crypto.randomUUID();
  const intake = process.env.SHOP_INTAKE_URL;
  if (intake) {
    try {
      const res = await fetch(intake, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, message: text, order, channel: "chat", id }),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202 && data.ticket_id) return { ok: true, ticketId: data.ticket_id, via: "n8n" };
      if (res.status === 400) return { ok: false, error: data.error ?? "The message was not accepted." };
    } catch {
      // n8n unreachable: fall through to the API so the demo keeps working
    }
  }
  try {
    const res = await fetch(`${CORE}/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({
        channel: "chat",
        customer_email: email,
        subject: order ? `Order ${order}` : null,
        body: order && !text.includes(order) ? `${text}\n\nOrder: ${order}` : text,
        external_id: `shop-${id}`,
      }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `Support is unavailable (${res.status}).` };
    const data = await res.json();
    return { ok: true, ticketId: data.ticket_id, via: "api" };
  } catch {
    return { ok: false, error: "Support is unreachable right now." };
  }
}

export async function ticketStatus(ticketId: string, email: string): Promise<TicketView | null> {
  try {
    const res = await fetch(`${CORE}/shop/tickets/${encodeURIComponent(ticketId)}?email=${encodeURIComponent(email)}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as TicketView) : null;
  } catch {
    return null;
  }
}
