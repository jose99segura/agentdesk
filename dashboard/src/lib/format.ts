export function ms(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`;
}

export function usd(v: number | null | undefined, digits = 4) {
  return v === null || v === undefined ? "—" : `$${Number(v).toFixed(digits)}`;
}

export function eur(cents: number | undefined) {
  return cents === undefined ? "—" : `€${(cents / 100).toFixed(2)}`;
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function humanize(s: string | null | undefined) {
  return (s ?? "").replaceAll("_", " ");
}
