import type { ReactNode } from "react";
import { NextTab } from "./InfoTabs";
import Toc, { type TocItem } from "./Toc";

/** One tab of the guide: its sections, an “on this page” index and a link to the next tab. */
export default function InfoPage({ href, toc, children }: { href: string; toc: TocItem[]; children: ReactNode }) {
  return (
    <div className="flex gap-12">
      <article className="min-w-0 max-w-5xl flex-1">
        <div className="space-y-16">{children}</div>
        <NextTab current={href} />
      </article>
      {toc.length > 1 && <Toc items={toc} />}
    </div>
  );
}
