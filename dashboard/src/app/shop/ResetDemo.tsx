"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resetDemo } from "./actions";

// Every approved refund uses up what is left to refund on a demo order; this puts the demo
// customers' orders back as they started, so "it arrived broken" earns a refund again.
export default function ResetDemo() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await resetDemo();
          setNote(r.ok ? `Demo reset (${r.removed} ${r.removed === 1 ? "refund" : "refunds"} undone)` : "Could not reset now");
          router.refresh();
        })
      }
      className="font-medium text-brand hover:underline disabled:opacity-50"
      title="Undo the refunds visitors approved, so every order can be tried again"
    >
      {pending ? "Resetting…" : note ?? "Reset demo"}
    </button>
  );
}
