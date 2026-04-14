import type { SourceReliabilityStatus } from "@prisma/client";

/** Lower runs earlier in scheduler queues. */
export const RELIABILITY_SCHEDULER_RANK: Record<SourceReliabilityStatus, number> = {
  HEALTHY: 0,
  DEGRADED: 1,
  COOLING_DOWN: 2,
  DISABLED: 99,
};

/**
 * Backoff after a failed ingestion job (from job completion time).
 * 1 fail: no extra cooldown; 2 → 2m; 3–4 → 15m; 5–7 → 2h; 8+ → exponential up to 48h.
 */
export function failureCooldownUntil(consecutiveFailures: number, from: Date): Date | null {
  if (consecutiveFailures <= 1) return null;
  let minutes = 0;
  if (consecutiveFailures === 2) minutes = 2;
  else if (consecutiveFailures < 5) minutes = 15;
  else if (consecutiveFailures < 8) minutes = 120;
  else {
    const exp = Math.min(6, consecutiveFailures - 8);
    minutes = Math.min(48 * 60, 120 * Math.pow(2, exp));
  }
  return new Date(from.getTime() + minutes * 60_000);
}

/** Extra cooldown when empty streak is very long (reduces pointless polling). */
export function emptyStreakCooldownUntil(consecutiveEmptyRuns: number, from: Date): Date | null {
  if (consecutiveEmptyRuns < 15) return null;
  const minutes = consecutiveEmptyRuns >= 25 ? 240 : 45;
  return new Date(from.getTime() + minutes * 60_000);
}

export function mergeCooldown(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** Negative discovery score adjustment when the originating source is unreliable. */
export function discoveryReliabilityScorePenalty(input: {
  reliabilityStatus: SourceReliabilityStatus;
  consecutiveEmptyRuns: number;
  consecutiveFailures: number;
}): number {
  let p = 0;
  if (input.reliabilityStatus === "DISABLED") return 100;
  if (input.reliabilityStatus === "COOLING_DOWN") p += 12;
  else if (input.reliabilityStatus === "DEGRADED") p += 6;
  p += Math.min(18, input.consecutiveEmptyRuns * 2);
  p += Math.min(12, input.consecutiveFailures * 2);
  return Math.min(40, p);
}

export function msFromEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  if (!raw) return fallbackMs;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallbackMs;
}
