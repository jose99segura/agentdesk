"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ShopCustomer } from "@/lib/shop";
import { sendToSupport, ticketStatus, type TicketView } from "./actions";

// The store's support widget. A message becomes a ticket (through n8n in production), and
// the widget then follows that ticket: what the agents are doing, that a person is reviewing
// the reply, and finally the approved reply itself. The conversation is kept in this
// browser only, per demo customer.

type Turn =
  | { kind: "me"; text: string; order: string | null; at: number }
  | { kind: "ticket"; ticketId: string; via: "n8n" | "api"; view: TicketView | null; at: number }
  | { kind: "error"; text: string; at: number };

const SUGGESTIONS = [
  { label: "Where is my order?", text: (o: string) => `Hi, where is my order ${o}? It has been a while.` },
  { label: "It arrived broken", text: (o: string) => `My order ${o} arrived broken. Can I get a refund?` },
  { label: "Cancel it", text: (o: string) => `Please cancel order ${o}, I don't need it anymore.` },
  { label: "En español", text: (o: string) => `Hola, el pedido ${o} llegó con una pieza rota. ¿Qué podéis hacer?` },
];

const storageKey = (email: string) => `shop-chat:${email}`;

function load(email: string): Turn[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(email)) ?? "[]") as Turn[];
  } catch {
    return [];
  }
}

function save(email: string, turns: Turn[]) {
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(turns.slice(-30)));
  } catch {
    // storage unavailable: the chat still works for this visit
  }
}

const settled = (v: TicketView | null) => !!v?.reply;

export default function SupportChat({ customer, orders }: { customer: ShopCustomer; orders: string[] }) {
  const [open, setOpen] = useState(false);
  // Nothing of the conversation renders until the widget is opened, so reading storage
  // here cannot make the hydrated markup differ from the server's.
  const [turns, setTurns] = useState<Turn[]>(() => (typeof window === "undefined" ? [] : load(customer.email)));
  const [text, setText] = useState("");
  const [order, setOrder] = useState<string | null>(orders[0] ?? null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (fn: (t: Turn[]) => Turn[]) =>
      setTurns((prev) => {
        const next = fn(prev);
        save(customer.email, next);
        return next;
      }),
    [customer.email],
  );

  // "Get help with this order" links land here as #help-<order id>.
  useEffect(() => {
    const onHash = () => {
      const m = location.hash.match(/^#help-(.+)$/);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      if (orders.includes(id)) setOrder(id);
      setOpen(true);
      history.replaceState(null, "", location.pathname + location.search);
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [orders]);

  // Follow every ticket that has no reply yet: quickly at first, then calmly while a person reviews.
  const waiting = turns.filter((t): t is Extract<Turn, { kind: "ticket" }> => t.kind === "ticket" && !settled(t.view));
  const waitingKey = waiting.map((t) => t.ticketId).join(",");
  useEffect(() => {
    if (!waitingKey) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      for (const id of waitingKey.split(",")) {
        const view = await ticketStatus(id, customer.email);
        if (stop) return;
        if (view) update((ts) => ts.map((t) => (t.kind === "ticket" && t.ticketId === id ? { ...t, view } : t)));
      }
      const oldest = Math.min(...waiting.map((t) => t.at));
      timer = setTimeout(tick, Date.now() - oldest < 120_000 ? 3000 : 10_000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // waiting is derived from waitingKey; re-running on every view change would restart the loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingKey, customer.email, update]);

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, open]);

  const send = (message: string) => {
    const body = message.trim();
    if (!body || pending) return;
    setText("");
    update((t) => [...t, { kind: "me", text: body, order, at: Date.now() }]);
    start(async () => {
      const r = await sendToSupport(customer.email, body, order);
      update((t) => [
        ...t,
        r.ok
          ? { kind: "ticket", ticketId: r.ticketId, via: r.via, view: null, at: Date.now() }
          : { kind: "error", text: r.error, at: Date.now() },
      ]);
    });
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-canvas shadow-lg hover:opacity-90"
        >
          <span className="h-2 w-2 rounded-full bg-ok" /> Chat with support
        </button>
      )}
      {open && (
        <div className="fixed inset-x-3 bottom-3 z-30 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Hearth &amp; Co. support</div>
              <div className="text-[11px] text-faint">AI agents draft, a person approves · as {customer.name}</div>
            </div>
            <div className="flex items-center gap-1">
              {turns.length > 0 && (
                <button onClick={() => update(() => [])} className="rounded px-2 py-1 text-[11px] text-faint hover:bg-ink/5 hover:text-ink">
                  Clear
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="Close chat" className="rounded px-2 py-1 text-faint hover:bg-ink/5 hover:text-ink">
                ✕
              </button>
            </div>
          </div>

          <div ref={box} className="flex min-h-[260px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
            <Bubble side="them">
              Hi {customer.name.split(" ")[0]}! Ask us anything about your orders. Pick the order below so we can find it faster.
            </Bubble>
            {turns.map((t, i) =>
              t.kind === "me" ? (
                <Bubble key={i} side="me">
                  {t.text}
                  {t.order && !t.text.includes(t.order) && <div className="mt-1 text-[11px] opacity-70">about {t.order}</div>}
                </Bubble>
              ) : t.kind === "error" ? (
                <p key={i} className="text-center text-xs text-bad">{t.text}</p>
              ) : (
                <TicketTurn key={i} turn={t} />
              ),
            )}
          </div>

          <div className="border-t border-line px-3 pb-3 pt-2">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {order &&
                SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    disabled={pending}
                    onClick={() => send(s.text(order))}
                    className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-40"
                  >
                    {s.label}
                  </button>
                ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
              className="flex flex-col gap-2"
            >
              <select
                value={order ?? ""}
                onChange={(e) => setOrder(e.target.value || null)}
                className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs"
              >
                <option value="">No specific order</option>
                {orders.map((o) => (
                  <option key={o} value={o}>Order {o}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write a message…"
                  maxLength={1500}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-base sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={pending || text.trim().length < 3}
                  className="rounded-lg bg-ink px-3 py-2 text-sm font-medium text-canvas disabled:opacity-40"
                >
                  {pending ? "…" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ side, children }: { side: "me" | "them"; children: React.ReactNode }) {
  return (
    <div
      className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
        side === "me" ? "self-end rounded-br-md bg-ink text-canvas" : "self-start rounded-bl-md bg-panel-2"
      }`}
    >
      {children}
    </div>
  );
}

const money = (cents: number) => `€${(cents / 100).toFixed(2)}`;

// What the customer is shown while the ticket moves: the real state, in plain words.
function steps(v: TicketView | null, via: "n8n" | "api") {
  const working = !v || v.job?.status === "queued" || v.job?.status === "running";
  return [
    { label: via === "n8n" ? "Received through our n8n intake" : "Received", done: true },
    {
      label: v?.job?.status === "dead" ? "Our system hit a problem; a person will pick this up" :
        v?.agents.length ? `Agents on it: ${v.agents.join(", ")}` : "Agents are reading your message",
      done: !!v && !working,
      active: working,
      detail: v?.looked_up.length ? `Checked ${v.looked_up.join(", ")}` : undefined,
    },
    {
      label: v?.status === "needs_human" ? "Handed to a person on our team" :
        v?.reply_status === "rejected" ? "The reviewer asked for a better reply" : "A person is reviewing the reply",
      done: !!v?.reply,
      active: !!v && !working && !v.reply,
      detail: v?.refund ? `Refund of ${money(v.refund.amount_cents)} on ${v.refund.order_id}: ${v.refund.status}` : undefined,
    },
  ] as { label: string; done: boolean; active?: boolean; detail?: string }[];
}

function TicketTurn({ turn }: { turn: Extract<Turn, { kind: "ticket" }> }) {
  const v = turn.view;
  return (
    <>
      <div className="self-start rounded-xl border border-dashed border-line-strong px-3 py-2 text-xs">
        <ol className="flex flex-col gap-1.5">
          {steps(v, turn.via).map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className={`mt-0.5 ${s.done ? "text-ok" : s.active ? "animate-pulse text-warn" : "text-faint"}`}>{s.done ? "✓" : "●"}</span>
              <span>
                <span className={s.done || s.active ? "text-ink" : "text-faint"}>{s.label}</span>
                {s.detail && <span className="block text-faint">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-1.5 font-mono text-[10px] text-faint">ticket {turn.ticketId.slice(0, 8)}</div>
      </div>
      {v?.reply && <Bubble side="them">{v.reply}</Bubble>}
    </>
  );
}
