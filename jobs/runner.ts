// Job runner — dispatches ingestion jobs by source type
// Phase 1: synchronous single-job execution
// Phase 2: replace with a proper queue (BullMQ, Trigger.dev, etc.)

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { AdapterRunResult, SourceType } from "@/types";
import type { SyncRunSummary } from "@/lib/sources/shared/types";

function syncSummaryToAdapterResult(s: SyncRunSummary): AdapterRunResult {
  return {
    jobId: s.jobId,
    status: s.status,
    totalFetched: s.totalFetched,
    totalStored: s.totalStored,
    totalNormalized: s.totalNormalized,
    totalSkipped: s.totalSkipped,
    totalFailed: s.totalFailed,
    durationMs: s.durationMs,
    error: s.fatalError,
    warnings: s.warnings,
    batchCount: s.batchCount,
    finalCursor: s.finalCursor,
  };
}

async function runSyncForSourceType(
  sourceType: SourceType,
  sourceId: string,
  triggeredBy: string,
  cursor?: string
): Promise<SyncRunSummary> {
  switch (sourceType) {
    case "META_ADS": {
      const { runMetaAdsSync } = await import("@/lib/sources/jobs/run-meta-ads-sync");
      return runMetaAdsSync({
        sourceId,
        triggeredBy,
        initialJobCursor: cursor,
      });
    }
    case "SHOPIFY_STOREFRONT": {
      const { runShopifyStoreSync } = await import("@/lib/sources/jobs/run-shopify-store-sync");
      return runShopifyStoreSync({
        sourceId,
        triggeredBy,
        initialJobCursor: cursor,
      });
    }
    default:
      throw new Error(`No ingestion entrypoint registered for source type: ${sourceType}`);
  }
}

/**
 * Run a single ingestion job for a source.
 * Safe to call multiple times — idempotent upserts handle duplicate runs.
 */
export async function runIngestionJob(
  sourceId: string,
  triggeredBy = "manual",
  cursor?: string
): Promise<AdapterRunResult> {
  logger.info("[runner] Starting ingestion job", { sourceId, triggeredBy });

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
  });

  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  if (source.status === "PAUSED") {
    throw new Error(`Source ${sourceId} is paused. Resume it before running.`);
  }

  const runningJob = await prisma.ingestionJob.findFirst({
    where: { sourceId, status: "RUNNING" },
  });

  if (runningJob) {
    throw new Error(
      `Source ${sourceId} already has a running job (${runningJob.id}). ` +
        "Wait for it to complete or mark it as failed before starting a new one."
    );
  }

  const summary = await runSyncForSourceType(source.type, sourceId, triggeredBy, cursor);
  const result = syncSummaryToAdapterResult(summary);

  logger.info("[runner] Job complete", {
    jobId: result.jobId,
    status: result.status,
    durationMs: result.durationMs,
    totalNormalized: result.totalNormalized,
  });

  return result;
}

/**
 * Trigger jobs for all active sources.
 * Used for cron-based full refresh.
 */
export async function runAllActiveSources(triggeredBy = "cron"): Promise<AdapterRunResult[]> {
  const sources = await prisma.source.findMany({
    where: { status: "ACTIVE" },
  });

  const results: AdapterRunResult[] = [];

  for (const source of sources) {
    try {
      const result = await runIngestionJob(source.id, triggeredBy);
      results.push(result);
    } catch (err) {
      logger.error("[runner] Failed to run job for source", {
        sourceId: source.id,
        sourceName: source.name,
        error: String(err),
      });
    }
  }

  return results;
}

/**
 * Get job status for display in admin UI.
 */
export async function getJobStatus(jobId: string) {
  return prisma.ingestionJob.findUnique({
    where: { id: jobId },
    include: {
      source: { select: { id: true, name: true, type: true } },
    },
  });
}

/**
 * Force-cancel a stuck RUNNING job.
 * Does NOT actually stop the running process (Phase 1 limitation) —
 * it marks the job as FAILED so a new one can be started.
 */
export async function cancelJob(jobId: string): Promise<void> {
  const job = await prisma.ingestionJob.findUnique({ where: { id: jobId } });

  if (!job) throw new Error(`Job not found: ${jobId}`);

  if (job.status !== "RUNNING" && job.status !== "PENDING") {
    throw new Error(`Job ${jobId} is not in a cancellable state (status: ${job.status})`);
  }

  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      error: "Manually cancelled",
      completedAt: new Date(),
    },
  });

  logger.info("[runner] Job manually cancelled", { jobId });
}
