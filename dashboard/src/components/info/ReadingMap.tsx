import Link from "next/link";
import { READING_MAP } from "./content";

/** The seven tabs as a reading plan: what each answers and how long it takes. */
export default function ReadingMap() {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {READING_MAP.map(([href, name, what, time], i) => (
        <li key={href}>
          <Link href={href} className="flex h-full gap-3 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong text-xs font-semibold tabular-nums text-muted">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{name}</span>
                <span className="shrink-0 text-[11px] text-faint">{time}</span>
              </span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted">{what}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
