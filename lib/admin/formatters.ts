export function compactNumber(n: number | null | undefined): string {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const abs = Math.abs(x);
  if (abs < 1000) return String(Math.round(x));
  if (abs < 1_000_000) return `${(x / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  if (abs < 1_000_000_000) return `${(x / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  return `${(x / 1_000_000_000).toFixed(1)}b`;
}

export function formatMoney(n: number | null | undefined, currency: string = "USD"): string {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: x >= 100 ? 0 : 2,
    }).format(x);
  } catch {
    return `${x.toFixed(2)} ${currency}`;
  }
}

export function formatPct(n: number | null | undefined): string {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const sign = x > 0 ? "+" : "";
  return `${sign}${(x * 100).toFixed(1)}%`;
}

export function trendBadgeVariant(score: number): "green" | "yellow" | "red" | "default" {
  if (score >= 70) return "green";
  if (score >= 45) return "yellow";
  if (score > 0) return "red";
  return "default";
}

