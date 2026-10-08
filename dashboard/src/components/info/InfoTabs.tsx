"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const INFO_TABS = [
  { href: "/info", label: "Overview" },
  { href: "/info/agents", label: "Agents" },
  { href: "/info/paths", label: "Paths & examples" },
  { href: "/info/safety", label: "Safety" },
  { href: "/info/quality", label: "Quality" },
  { href: "/info/operations", label: "Operations" },
  { href: "/info/reference", label: "Reference" },
];

export default function InfoTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]" aria-label="How it works sections">
      {INFO_TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${
              active ? "border-brand font-medium text-ink" : "border-transparent text-faint hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** “Next: …” at the bottom of each tab, so the guide reads in order. */
export function NextTab({ current }: { current: string }) {
  const i = INFO_TABS.findIndex((t) => t.href === current);
  const next = INFO_TABS[i + 1];
  if (!next) return null;
  return (
    <Link href={next.href} className="mt-16 flex items-center justify-between rounded-xl border border-line bg-panel p-5 transition-colors hover:border-line-strong">
      <span>
        <span className="block text-xs text-faint">Next</span>
        <span className="text-base font-semibold">{next.label}</span>
      </span>
      <span className="text-xl text-faint">→</span>
    </Link>
  );
}
