// Hashing utilities for change detection and deduplication
import { createHash } from "crypto";

/**
 * Compute SHA-256 hash of a JSON payload.
 * Used to detect if a raw record has changed between syncs.
 */
export function hashPayload(payload: unknown): string {
  const normalized = JSON.stringify(payload, sortObjectKeys);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Stable JSON stringification — sorts object keys for consistent hashing.
 */
function sortObjectKeys(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce((sorted: Record<string, unknown>, k) => {
        sorted[k] = (value as Record<string, unknown>)[k];
        return sorted;
      }, {});
  }
  return value;
}

/**
 * Short hash for display purposes (first 8 chars of sha256).
 */
export function shortHash(payload: unknown): string {
  return hashPayload(payload).substring(0, 8);
}
