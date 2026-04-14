export type SortOrder = "asc" | "desc";

export function parseIntParam(
  v: string | null,
  def: number,
  opts?: { min?: number; max?: number }
): number {
  const n = v == null ? NaN : Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  const min = opts?.min ?? -Infinity;
  const max = opts?.max ?? Infinity;
  return Math.min(max, Math.max(min, n));
}

export function parsePageParams(sp: URLSearchParams, defaults?: { page?: number; pageSize?: number }) {
  const page = parseIntParam(sp.get("page"), defaults?.page ?? 1, { min: 1, max: 10_000 });
  const pageSize = parseIntParam(sp.get("pageSize"), defaults?.pageSize ?? 20, { min: 1, max: 200 });
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function sanitizeOrder(raw: string | null | undefined, def: SortOrder = "desc"): SortOrder {
  const v = (raw ?? "").toLowerCase();
  return v === "asc" || v === "desc" ? v : def;
}

export function sanitizeSort<T extends readonly string[]>(
  raw: string | null | undefined,
  whitelist: T,
  def: T[number]
): T[number] {
  const v = (raw ?? "").trim();
  return (whitelist as readonly string[]).includes(v) ? (v as T[number]) : def;
}

