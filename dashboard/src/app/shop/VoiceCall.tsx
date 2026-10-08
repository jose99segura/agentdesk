"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useRef, useState } from "react";
import { recentVoiceTickets, startVoiceSession } from "./actions";

// Phone support in the browser: an ElevenLabs voice agent (ElevenAgents) that can read the
// caller's orders and file a ticket, never refund. The API signs who is calling; the agent
// passes that back on every tool call. When the call ends, the ticket it filed (if any)
// is handed to the chat, which follows it like any other until a person approves the reply.

type Line = { role: "user" | "agent"; text: string };

export default function VoiceCall(props: { email: string; onTickets: (ids: string[]) => void }) {
  return (
    <ConversationProvider>
      <Call {...props} />
    </ConversationProvider>
  );
}

function Call({ email, onTickets }: { email: string; onTickets: (ids: string[]) => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const startedAt = useRef(0);

  const conversation = useConversation({
    onMessage: (m) => setLines((l) => [...l.slice(-5), { role: m.role, text: m.message }]),
    onError: (message) => setError(typeof message === "string" ? message : "The call failed."),
    onDisconnect: async () => {
      if (!startedAt.current) return;
      startedAt.current = 0;
      // The webhook tool commits before the agent speaks, so the ticket is already there.
      const ids = await recentVoiceTickets(email);
      if (ids.length) onTickets(ids);
    },
  });
  const live = conversation.status === "connected" || conversation.status === "connecting";

  const start = async () => {
    setError(null);
    setLines([]);
    setStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStarting(false);
      setError("Allow the microphone to call support.");
      return;
    }
    const s = await startVoiceSession(email);
    setStarting(false);
    if (!s.ok) {
      setError(s.error);
      return;
    }
    startedAt.current = Date.now();
    conversation.startSession({ conversationToken: s.token, connectionType: "webrtc", dynamicVariables: s.variables });
  };

  return (
    <div className="border-b border-line px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs">
          {live ? (
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${conversation.isSpeaking ? "animate-pulse bg-brand" : "bg-ok"}`} />
              {conversation.status === "connecting" ? "Connecting…" : conversation.isSpeaking ? "Support is speaking" : "Listening"}
            </span>
          ) : (
            <span className="text-faint">Prefer to talk? A voice agent can check your orders and file a request.</span>
          )}
        </div>
        {live ? (
          <button onClick={() => conversation.endSession()} className="shrink-0 rounded-full bg-bad px-3 py-1.5 text-xs font-medium text-white">
            Hang up
          </button>
        ) : (
          <button
            onClick={start}
            disabled={starting}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium hover:bg-ink/5 disabled:opacity-40"
          >
            {starting ? "Calling…" : "Call support"}
          </button>
        )}
      </div>
      {live && lines.length > 0 && (
        <div className="mt-2 flex flex-col gap-1 text-[11px]">
          {lines.slice(-3).map((l, i) => (
            <p key={i} className={l.role === "user" ? "text-muted" : "text-ink"}>
              <span className="text-faint">{l.role === "user" ? "You: " : "Support: "}</span>
              {l.text}
            </p>
          ))}
        </div>
      )}
      {error && <p className="mt-1.5 text-[11px] text-bad">{error}</p>}
    </div>
  );
}
