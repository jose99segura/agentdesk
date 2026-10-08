import Link from "next/link";
import { Suspense } from "react";
import { loadCatalog, loadCustomer, type Order } from "@/lib/shop";
import ThemeToggle from "@/components/ThemeToggle";
import SupportChat from "./SupportChat";

export const metadata = { title: "Hearth & Co. (demo store)" };

// The customer's side of agentdesk: a mock homeware store whose support chat is answered by
// the real platform. Pick who you are, look at your orders, ask support about one of them.

const money = (cents: number) => `€${(cents / 100).toFixed(2)}`;

const ORDER_TONE: Record<string, string> = {
  processing: "bg-info/10 text-info",
  shipped: "bg-brand/10 text-brand",
  delivered: "bg-ok/10 text-ok",
  cancelled: "bg-bad/10 text-bad",
  returned: "bg-warn/10 text-warn",
};

// A soft colour per product so the grid reads as a shop without any image assets.
const TILE = ["from-amber-200 to-orange-300", "from-stone-200 to-stone-400", "from-emerald-200 to-teal-300",
  "from-rose-200 to-pink-300", "from-sky-200 to-indigo-300", "from-lime-200 to-green-300",
  "from-violet-200 to-purple-300", "from-yellow-100 to-amber-300"];

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function ShopPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <Shop searchParams={searchParams} />
    </Suspense>
  );
}

async function Shop({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const catalog = await loadCatalog();
  if (!catalog) {
    return (
      <main className="grid min-h-screen place-items-center bg-canvas p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold">The demo store is offline</h1>
          <p className="mt-2 text-sm text-muted">The agentdesk API did not answer. Try again in a minute.</p>
        </div>
      </main>
    );
  }
  const asParam = typeof params.as === "string" ? params.as : undefined;
  const email = catalog.customers.find((c) => c.email === asParam)?.email ?? catalog.customers[0]?.email;
  const me = email ? await loadCustomer(email) : null;

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="border-b border-line bg-brand/[0.07] px-4 py-2 text-center text-xs text-muted">
        Demo store. Products and customers are fictional; the support chat is answered by the real agentdesk
        platform, and a person approves every reply before it reaches you.{" "}
        <Link href="/" className="font-medium text-brand hover:underline">Watch it in the control room →</Link>
      </div>

      <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link href="/shop" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-sm font-bold text-white">H</span>
            <span className="text-lg font-semibold tracking-tight">Hearth &amp; Co.</span>
          </Link>
          <nav className="hidden gap-5 text-sm text-muted sm:flex">
            <a href="#shop">Shop</a>
            <a href="#orders">My orders</a>
            <a href="#help">Help</a>
          </nav>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="hidden text-faint sm:inline">Signed in as</span>
            <div className="flex overflow-hidden rounded-lg border border-line">
              {catalog.customers.map((c) => (
                <Link
                  key={c.email}
                  href={`/shop?as=${encodeURIComponent(c.email)}`}
                  className={`px-2.5 py-1.5 transition-colors ${c.email === email ? "bg-ink text-canvas" : "bg-panel text-muted hover:text-ink"}`}
                >
                  {c.name.split(" ")[0]}
                </Link>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-32 sm:px-8">
        <section className="py-10">
          <p className="text-sm text-faint">Handmade homeware, shipped across Europe</p>
          <h1 className="mt-1 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Good things for slow mornings{me ? `, ${me.customer.name.split(" ")[0]}` : ""}.
          </h1>
        </section>

        <section id="orders" className="scroll-mt-20">
          <h2 className="text-lg font-semibold">My orders</h2>
          <p className="mt-1 text-sm text-muted">Each one has a “Get help” button that opens the chat about it.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {me?.orders.length ? me.orders.map((o) => <OrderCard key={o.id} order={o} />) : (
              <p className="text-sm text-faint">No orders yet.</p>
            )}
          </div>
        </section>

        <section id="shop" className="scroll-mt-20 pt-12">
          <h2 className="text-lg font-semibold">Shop</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {catalog.products.map((p, i) => (
              <div key={p.sku} className="group">
                <div className={`grid aspect-square place-items-center rounded-xl bg-gradient-to-br ${TILE[i % TILE.length]} text-3xl font-semibold text-white/80`}>
                  {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <div className="mt-2 flex items-start justify-between gap-2 text-sm">
                  <span>{p.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{money(p.price_cents)}</span>
                </div>
                <button disabled className="mt-1 text-xs text-faint" title="The demo store does not take orders">
                  Add to basket (demo)
                </button>
              </div>
            ))}
          </div>
        </section>

        <section id="help" className="scroll-mt-20 pt-12">
          <h2 className="text-lg font-semibold">Help</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Write to us in the chat at the bottom right, in any language. Your message goes through our n8n intake
            workflow to the support agents, which look up your order, draft a reply and, when it applies, propose a
            refund. A person approves both before anything reaches you; usually within minutes.
          </p>
        </section>
      </main>

      {me && <SupportChat key={me.customer.email} customer={me.customer} orders={me.orders.map((o) => o.id)} />}
    </div>
  );
}

function OrderCard({ order: o }: { order: Order }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-sm font-medium">{o.id}</div>
          <div className="mt-0.5 text-xs text-faint">
            Ordered {o.created}
            {o.delivered && ` · delivered ${o.delivered}`}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_TONE[o.status] ?? "bg-ink/5 text-muted"}`}>{o.status}</span>
      </div>
      <ul className="mt-3 text-sm text-muted">
        {o.items.map((it, i) => (
          <li key={i}>{it.quantity} × {it.name}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="tabular-nums">
          {money(o.total_cents)}
          {o.refunded_cents > 0 && <span className="ml-2 text-xs text-ok">refunded {money(o.refunded_cents)}</span>}
        </span>
        <span className="text-xs text-faint">{o.carrier && o.tracking ? `${o.carrier} · ${o.tracking}` : ""}</span>
      </div>
      <a href={`#help-${o.id}`} className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-ink/5">
        Get help with this order
      </a>
    </div>
  );
}
