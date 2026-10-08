// Server-side reads of the demo store through the core API (the anon key cannot read it).

export type Product = { sku: string; name: string; price_cents: number };
export type ShopCustomer = { name: string; email: string; language: string; orders?: number };
export type Order = {
  id: string;
  status: string;
  total_cents: number;
  carrier: string | null;
  tracking: string | null;
  created: string;
  delivered: string | null;
  refunded_cents: number;
  items: { name: string; quantity: number }[];
};

const CORE = process.env.CORE_API_URL ?? "http://127.0.0.1:8000";

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${CORE}${path}`, {
      headers: { authorization: `Bearer ${process.env.CORE_API_TOKEN ?? ""}` },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export function loadCatalog() {
  return get<{ products: Product[]; customers: ShopCustomer[] }>("/shop/catalog");
}

export function loadCustomer(email: string) {
  return get<{ customer: ShopCustomer; orders: Order[] }>(`/shop/customers/${encodeURIComponent(email)}`);
}
