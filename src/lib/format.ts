/** Compact coin formatting: 1234567 -> "1.23M" */
export function coins(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}k`;
  if (abs >= 1) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(2)}`;
}

/** Full coin formatting with thousands separators. */
export function coinsFull(n: number): string {
  if (!isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function pct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** "12,345/wk" demand-style number */
export function perWeek(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")}/wk`;
}

export function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
