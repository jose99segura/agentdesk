import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ title, aside, children, className = "" }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-medium">{title}</h2>
          {aside && <div className="text-xs text-faint">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

type Tone = "default" | "ok" | "warn" | "bad" | "info";
const toneText: Record<Tone, string> = {
  default: "text-ink",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  info: "text-info",
};

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-3.5">
      <div className="text-xs text-faint">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${toneText[tone]}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
    </div>
  );
}

const badgeTone: Record<Tone, string> = {
  default: "bg-ink/5 text-muted",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  bad: "bg-bad/10 text-bad",
  info: "bg-info/10 text-info",
};

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${badgeTone[tone]}`}>{children}</span>;
}

export function Dot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  const bg = { default: "bg-faint", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info" }[tone];
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${bg} ${pulse ? "animate-pulse" : ""}`} />;
}

export function runTone(status: string): Tone {
  return status === "succeeded" ? "ok" : status === "failed" ? "bad" : "info";
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-faint">{children}</p>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const style = {
    primary: "bg-ink text-canvas hover:bg-ink/85",
    secondary: "border border-line-strong text-ink hover:bg-ink/5",
    danger: "border border-bad/40 text-bad hover:bg-bad/10",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${style}`}
    >
      {children}
    </button>
  );
}

export function Th({ children, right = false }: { children?: ReactNode; right?: boolean }) {
  return <th className={`px-4 py-2.5 text-xs font-normal text-faint ${right ? "text-right" : "text-left"}`}>{children}</th>;
}

export function Td({ children, right = false, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-4 py-2.5 ${right ? "text-right tabular-nums" : ""} ${className}`}>{children}</td>;
}
