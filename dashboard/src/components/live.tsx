"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

// One Realtime channel for the whole app. Any change on a platform table bumps a
// version number (debounced), and every live query refetches when it changes.
const LIVE_TABLES = ["tickets", "jobs", "runs", "run_steps", "proposals", "provider_health", "chaos", "audit_log"];

type Live = { version: number; connected: boolean };
const LiveContext = createContext<Live>({ version: 0, connected: false });

export function LiveProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const bump = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVersion((v) => v + 1), 250);
    };
    const channel = supabase.channel("live");
    for (const table of LIVE_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, bump);
    }
    channel.subscribe((status) => setConnected(status === "SUBSCRIBED"));
    // Time windows (last 24h, last hour) move even when nothing changes.
    const tick = setInterval(bump, 15_000);
    return () => {
      clearInterval(tick);
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, []);

  return <LiveContext.Provider value={{ version, connected }}>{children}</LiveContext.Provider>;
}

export function useLive() {
  return useContext(LiveContext);
}

/** Runs `load` on mount and again on every live change. */
export function useLiveQuery<T>(load: () => PromiseLike<T>, initial: T, deps: unknown[] = []): T {
  const { version } = useLive();
  const [data, setData] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    Promise.resolve(load()).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return data;
}
