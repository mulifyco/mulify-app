/**
 * Helpers for IngestionJob.metadata JSON (written by persisted-sync).
 */

export function jobWarningsCount(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const w = (metadata as { warnings?: unknown }).warnings;
  return Array.isArray(w) ? w.length : 0;
}

export function jobBatchCount(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;
  const b = (metadata as { batchCount?: unknown }).batchCount;
  return typeof b === "number" ? b : null;
}

export function jobWarningsList(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const w = (metadata as { warnings?: unknown }).warnings;
  if (!Array.isArray(w)) return [];
  return w.filter((x): x is string => typeof x === "string");
}

/** Human label for job row: metadata.jobType or triggeredBy. */
export function jobTypeLabel(metadata: unknown, triggeredBy: string): string {
  if (metadata && typeof metadata === "object") {
    const t = (metadata as { jobType?: unknown }).jobType;
    if (typeof t === "string" && t.trim()) return t;
  }
  return triggeredBy || "—";
}
