import { LINKS } from "./content";

/** Where the live pieces are: the n8n folder, the Langfuse project, the local services. */
export default function Links() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {LINKS.map(([name, href, what, where]) => (
        <li key={href}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex h-full flex-col rounded-xl border border-line bg-panel p-4 transition-colors hover:border-line-strong"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{name}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${where === "public" ? "bg-ok/10 text-ok" : "bg-ink/5 text-faint"}`}>
                {where === "public" ? "live" : "local"}
              </span>
            </span>
            <span className="mt-1 text-sm leading-relaxed text-muted">{what}</span>
            <span className="mt-2 truncate font-mono text-[11px] text-faint">{href.replace(/^https?:\/\//, "")} ↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
