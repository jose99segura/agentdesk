"use client";

import { useEffect, useState } from "react";

export type TocItem = { id: string; label: string };

// Highlights the section currently on screen.
export default function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="sticky top-20 hidden w-52 shrink-0 self-start xl:block" aria-label="On this page">
      <p className="mb-2 text-xs font-medium text-faint">On this page</p>
      <ol className="space-y-1 border-l border-line">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`-ml-px block border-l px-3 py-0.5 text-[13px] transition-colors ${
                active === item.id ? "border-brand text-ink" : "border-transparent text-faint hover:text-ink"
              }`}
            >
              <span className="mr-1.5 font-mono text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
