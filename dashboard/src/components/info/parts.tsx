import Image from "next/image";
import type { ReactNode } from "react";

export function Section({
  id,
  number,
  title,
  lead,
  plain,
  children,
}: {
  id: string;
  number: string;
  title: string;
  lead?: string;
  plain?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <p className="font-mono text-xs text-brand">{number}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="max-w-3xl">
        {lead && <p className="mt-2 text-base leading-relaxed text-muted">{lead}</p>}
        {plain && <Plain>{plain}</Plain>}
      </div>
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

/** The same idea without jargon, for a reader who is not an engineer. */
export function Plain({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 rounded-xl border border-brand/30 bg-brand/[0.06] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">In plain words</p>
      <div className="mt-1.5 text-sm leading-relaxed text-ink">{children}</div>
    </div>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

export function Shot({ src, alt, w, h, caption }: { src: string; alt: string; w: number; h: number; caption: ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-panel">
      <a href={src} target="_blank" rel="noreferrer" title="Open full size">
        <Image src={src} alt={alt} width={w} height={h} className="h-auto w-full bg-white transition-opacity hover:opacity-90" />
      </a>
      <figcaption className="border-t border-line px-4 py-3 text-sm leading-relaxed text-muted">{caption}</figcaption>
    </figure>
  );
}

export function Card3({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([title, body]) => (
        <div key={title} className="rounded-xl border border-line bg-panel p-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
        </div>
      ))}
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-ink">{children}</code>;
}

export function Pre({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-line bg-panel-2 p-4 font-mono text-[12px] leading-relaxed text-ink">
      {children}
    </pre>
  );
}
