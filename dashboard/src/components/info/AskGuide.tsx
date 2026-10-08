"use client";

// "Ask the guide": a chat with the explainer agent. Each question is a real agent run
// (core POST /explain): it goes through the model router, is recorded on Runs with its
// tokens and cost, and has a Langfuse trace, exactly like triage and the resolver.

import { useEffect, useRef, useState, useTransition } from "react";
import { askGuide, type GuideAnswer, type GuideTurn } from "@/app/actions";
import { SUGGESTED_QUESTIONS } from "./content";

/** Inline **bold** and `code`, nothing more: the models answer in light markdown. */
function inline(text: string, key: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={`${key}-${i}`} className="rounded bg-ink/[0.06] px-1 py-0.5 font-mono text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

/** Paragraphs and bullet lists from the answer's blank-line structure. */
function renderAnswer(text: string) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block, b) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        return (
          <ul key={b} className="list-disc space-y-1 pl-5">
            {lines.map((l, i) => (
              <li key={i}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${b}-${i}`)}</li>
            ))}
          </ul>
        );
      }
      return (
        <p key={b} className="whitespace-pre-wrap">
          {inline(block, `${b}`)}
        </p>
      );
    });
}

type Entry =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; meta?: GuideAnswer; error?: boolean };

export default function AskGuide() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, pending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    const history: GuideTurn[] = entries
      .filter((e) => !(e.role === "assistant" && e.error))
      .map((e) => ({ role: e.role, content: e.content }));
    setEntries((list) => [...list, { role: "user", content: q }]);
    setDraft("");
    start(async () => {
      const r = await askGuide(q, history);
      setEntries((list) => [
        ...list,
        r.ok
          ? { role: "assistant", content: r.data.answer, meta: r.data }
          : { role: "assistant", content: r.error, error: true },
      ]);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full border border-brand/40 bg-panel px-4 py-2.5 text-sm font-medium text-ink shadow-lg shadow-black/10 transition-colors hover:border-brand"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">?</span>
        Ask the guide
      </button>

      {open && (
        <aside
          role="dialog"
          aria-label="Ask the guide"
          className="fixed bottom-[4.5rem] right-5 z-20 flex h-[min(42rem,calc(100vh-6rem))] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-black/20"
        >
          <header className="border-b border-line px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Ask the guide</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  The <span className="font-medium text-ink">explainer</span> agent answers from this guide and from the running
                  code. Ask in any language. Each question is a run on <span className="font-medium text-ink">Runs</span>, with its
                  cost and trace.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-xs text-faint hover:bg-ink/5 hover:text-ink" aria-label="Close">
                ✕
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {entries.length === 0 && (
              <div>
                <p className="text-xs text-faint">Try one of these</p>
                <ul className="mt-2 space-y-1.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <li key={q}>
                      <button
                        onClick={() => ask(q)}
                        className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm text-muted transition-colors hover:border-line-strong hover:text-ink"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {entries.map((e, i) =>
              e.role === "user" ? (
                <div key={i} className="ml-8 rounded-xl bg-brand/10 px-3 py-2 text-sm text-ink">
                  {e.content}
                </div>
              ) : (
                <div key={i} className={`mr-4 rounded-xl border px-3 py-2 text-sm ${e.error ? "border-bad/40 text-bad" : "border-line text-ink"}`}>
                  <div className="space-y-2 leading-relaxed">{renderAnswer(e.content)}</div>
                  {e.meta && (
                    <p className="mt-2 border-t border-line pt-1.5 text-[11px] text-faint">
                      {e.meta.provider}/{e.meta.model} · {e.meta.latency_ms} ms · ${e.meta.cost_usd.toFixed(4)}
                      {e.meta.trace_url && (
                        <>
                          {" · "}
                          <a href={e.meta.trace_url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-ink">
                            trace ↗
                          </a>
                        </>
                      )}
                      {" · "}
                      <a href={`/runs?agent=explainer`} className="underline decoration-dotted hover:text-ink">
                        run
                      </a>
                    </p>
                  )}
                </div>
              ),
            )}
            {pending && <p className="text-xs text-faint">Thinking…</p>}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              ask(draft);
            }}
            className="border-t border-line p-3"
          >
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey) {
                  ev.preventDefault();
                  ask(draft);
                }
              }}
              rows={2}
              placeholder="Ask anything about how agentdesk works…"
              className="w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-faint">Enter to send · Shift+Enter for a new line</span>
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                className="rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-canvas transition-colors hover:bg-ink/85 disabled:opacity-40"
              >
                Ask
              </button>
            </div>
          </form>
        </aside>
      )}
    </>
  );
}
