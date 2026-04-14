import type { Source, SourceReliabilityStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { JobStatus } from "@/types";
import {
  emptyStreakCooldownUntil,
  failureCooldownUntil,
  mergeCooldown,
  RELIABILITY_SCHEDULER_RANK,
} from "@/lib/sources/reliability";
import { openReviewQueueItem } from "@/server/services/review-queue.service";

function maxReliability(a: SourceReliabilityStatus, b: SourceReliabilityStatus): SourceReliabilityStatus {
  const order: SourceReliabilityStatus[] = ["HEALTHY", "DEGRADED", "COOLING_DOWN", "DISABLED"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function shouldAutoDisable(params: {
  consecutiveFailures: number;
  consecutiveEmptyRuns: number;
  lastHealthyAt: Date | null;
  createdAt: Date;
  now: Date;
}): boolean {
  const { consecutiveFailures, consecutiveEmptyRuns, lastHealthyAt, createdAt, now } = params;
  const ageDays = (now.getTime() - createdAt.getTime()) / (86400_000);
  if (ageDays < 3) return false;

  const noSuccessLong =
    !lastHealthyAt || now.getTime() - lastHealthyAt.getTime() > 30 * 86400_000;
  if (consecutiveFailures >= 15 && noSuccessLong) return true;

  const noSuccessMedium =
    !lastHealthyAt || now.getTime() - lastHealthyAt.getTime() > 14 * 86400_000;
  if (consecutiveEmptyRuns >= 22 && noSuccessMedium) return true;

  return false;
}

async function maybeReliabilityReviewAlerts(
  source: Pick<Source, "id" | "name" | "consecutiveFailures" | "consecutiveEmptyRuns">
): Promise<void> {
  try {
    if (source.consecutiveFailures >= 7) {
      await openReviewQueueItem({
        type: "SOURCE_RELIABILITY_ALERT",
        title: `Source failing repeatedly: ${source.name}`,
        reason: `consecutiveFailures=${source.consecutiveFailures} — check credentials, rate limits, and recent job errors.`,
        sourceId: source.id,
        priority: 72,
        dedupeKey: `source_reliability_failures:${source.id}`,
        metadata: {
          kind: "failures",
          consecutiveFailures: source.consecutiveFailures,
        },
      });
    }
    if (source.consecutiveEmptyRuns >= 12) {
      await openReviewQueueItem({
        type: "SOURCE_RELIABILITY_ALERT",
        title: `Source empty sync streak: ${source.name}`,
        reason: `consecutiveEmptyRuns=${source.consecutiveEmptyRuns} — connector returns no rows; verify feed still has inventory/ads.`,
        sourceId: source.id,
        priority: 68,
        dedupeKey: `source_reliability_empty:${source.id}`,
        metadata: {
          kind: "empty_streak",
          consecutiveEmptyRuns: source.consecutiveEmptyRuns,
        },
      });
    }
  } catch {
    // non-fatal
  }
}

export type ReliabilityIngestionOutcome = {
  sourceId: string;
  jobStatus: JobStatus;
  totalFetched: number;
  totalNormalized: number;
  totalStored: number;
};

/**
 * Updates Source reliability counters after an ingestion job reaches a terminal state.
 */
export async function applyReliabilityAfterIngestion(outcome: ReliabilityIngestionOutcome): Promise<void> {
  const source = await prisma.source.findUnique({ where: { id: outcome.sourceId } });
  if (!source) return;

  const now = new Date();
  const failed = outcome.jobStatus === "FAILED";
  const ok = outcome.jobStatus === "COMPLETED" || outcome.jobStatus === "PARTIAL";
  const emptyOk =
    ok &&
    outcome.totalFetched === 0 &&
    outcome.totalNormalized === 0;
  const meaningfulOk =
    ok &&
    (outcome.totalFetched > 0 || outcome.totalNormalized > 0 || outcome.totalStored > 0);

  let consecutiveFailures = source.consecutiveFailures;
  let consecutiveEmptyRuns = source.consecutiveEmptyRuns;
  let reliabilityStatus: SourceReliabilityStatus = source.reliabilityStatus;
  let cooldownUntil: Date | null = source.cooldownUntil;
  let lastHealthyAt = source.lastHealthyAt;
  let disabledReason = source.disabledReason;

  if (source.reliabilityStatus === "DISABLED") {
    return;
  }

  if (failed) {
    consecutiveFailures += 1;
    consecutiveEmptyRuns = 0;
    const failCd = failureCooldownUntil(consecutiveFailures, now);
    cooldownUntil = mergeCooldown(failCd, cooldownUntil);

    let nextStatus: SourceReliabilityStatus = "HEALTHY";
    if (consecutiveFailures >= 5) nextStatus = "COOLING_DOWN";
    else if (consecutiveFailures >= 3) nextStatus = "DEGRADED";
    reliabilityStatus = maxReliability(reliabilityStatus, nextStatus);

    if (
      shouldAutoDisable({
        consecutiveFailures,
        consecutiveEmptyRuns,
        lastHealthyAt,
        createdAt: source.createdAt,
        now,
      })
    ) {
      reliabilityStatus = "DISABLED";
      disabledReason = "auto:chronic_failure";
      cooldownUntil = null;
    }
  } else if (meaningfulOk) {
    consecutiveFailures = 0;
    consecutiveEmptyRuns = 0;
    lastHealthyAt = now;
    reliabilityStatus = "HEALTHY";
    cooldownUntil = null;
    disabledReason = null;
  } else if (emptyOk) {
    consecutiveEmptyRuns += 1;
    const emptyCd = emptyStreakCooldownUntil(consecutiveEmptyRuns, now);
    cooldownUntil = mergeCooldown(emptyCd, cooldownUntil);

    let nextStatus: SourceReliabilityStatus = "HEALTHY";
    if (consecutiveEmptyRuns >= 12) nextStatus = "COOLING_DOWN";
    else if (consecutiveEmptyRuns >= 5) nextStatus = "DEGRADED";
    reliabilityStatus = maxReliability(reliabilityStatus, nextStatus);

    if (
      shouldAutoDisable({
        consecutiveFailures,
        consecutiveEmptyRuns,
        lastHealthyAt,
        createdAt: source.createdAt,
        now,
      })
    ) {
      reliabilityStatus = "DISABLED";
      disabledReason = "auto:empty_streak_dead";
      cooldownUntil = null;
    }
  }

  const data: Record<string, unknown> = {
    reliabilityStatus,
    consecutiveFailures,
    consecutiveEmptyRuns,
    lastHealthyAt,
    cooldownUntil,
    disabledReason,
  };

  if (meaningfulOk) {
    data.lastSuccessAt = now;
    data.lastErrorAt = null;
  }

  await prisma.source.update({
    where: { id: source.id },
    data: data as never,
  });

  await maybeReliabilityReviewAlerts({
    id: source.id,
    name: source.name,
    consecutiveFailures,
    consecutiveEmptyRuns,
  });
}

export async function applyReliabilityAfterIngestionSafe(outcome: ReliabilityIngestionOutcome): Promise<void> {
  try {
    await applyReliabilityAfterIngestion(outcome);
  } catch (e) {
    logger.warn("[source-reliability] apply failed (non-fatal)", {
      sourceId: outcome.sourceId,
      error: String(e),
    });
  }
}

export function schedulerSkipReason(source: Pick<Source, "reliabilityStatus" | "cooldownUntil">): string | null {
  if (source.reliabilityStatus === "DISABLED") {
    return "reliability_disabled";
  }
  if (source.cooldownUntil && source.cooldownUntil.getTime() > Date.now()) {
    return "reliability_cooldown";
  }
  return null;
}

export function isSourceRunnableByScheduler(
  source: Pick<Source, "reliabilityStatus" | "cooldownUntil">,
  triggeredBy: string
): { ok: true } | { ok: false; code: "SOURCE_DISABLED" | "SOURCE_COOLDOWN"; message: string } {
  if (source.reliabilityStatus === "DISABLED") {
    return {
      ok: false,
      code: "SOURCE_DISABLED",
      message: "Source is disabled for reliability. Re-enable from source settings or the reset API.",
    };
  }
  if (
    triggeredBy !== "manual" &&
    source.cooldownUntil &&
    source.cooldownUntil.getTime() > Date.now()
  ) {
    return {
      ok: false,
      code: "SOURCE_COOLDOWN",
      message: `Source is in reliability cooldown until ${source.cooldownUntil.toISOString()}.`,
    };
  }
  return { ok: true };
}

export function schedulerSortKey(source: Pick<Source, "reliabilityStatus" | "priority" | "lastSyncAt">): number[] {
  const rank = RELIABILITY_SCHEDULER_RANK[source.reliabilityStatus] ?? 0;
  const pri = source.priority ?? 0;
  const last = source.lastSyncAt ? source.lastSyncAt.getTime() : 0;
  return [rank, -pri, last];
}

export function compareSchedulerSources(
  a: Pick<Source, "reliabilityStatus" | "priority" | "lastSyncAt">,
  b: Pick<Source, "reliabilityStatus" | "priority" | "lastSyncAt">
): number {
  const ka = schedulerSortKey(a);
  const kb = schedulerSortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  return 0;
}
