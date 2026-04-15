/**
 * Generic persisted ingestion loop: job lifecycle, pagination, raw store, normalize, apply.
 */

import { randomUUID } from "crypto";
import type { SourceType, JobStatus } from "@/types";
import type { SourceAdapter } from "@/lib/sources/shared/contracts";
import type { AdapterRuntimeConfigBase, IngestionContext, SyncRunSummary } from "@/lib/sources/shared/types";
import { SyncResultBuilder } from "@/lib/sources/shared/result";
import prisma from "@/lib/prisma";
import type { Source } from "@prisma/client";
import { sourceDb } from "@/lib/prisma-source-delegate";
import { logger } from "@/lib/logger";
import { persistRawPayload } from "@/lib/sources/persistence/raw-record";
import { applyMappingResult } from "@/lib/sources/persistence/apply-mapping";
import { applyReliabilityAfterIngestionSafe } from "@/server/services/source-reliability.service";

async function writeSyncLog(
  sourceId: string,
  jobId: string | null,
  level: "info" | "warn" | "error" | "debug",
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.syncLog.create({
      data: {
        sourceId,
        jobId,
        level,
        message,
        data: (data as never) ?? null,
      },
    });
  } catch {
    logger.warn("[persisted-sync] sync log write failed", { message });
  }
}

export async function runPersistedSourceSync<TConfig, TRaw>(params: {
  adapter: SourceAdapter<TConfig, TRaw>;
  sourceId: string;
  expectedSourceType: SourceType;
  triggeredBy: string;
  initialJobCursor?: string;
  validateResolvedConfig?: (config: TConfig) => Promise<void>;
}): Promise<SyncRunSummary> {
  const {
    adapter,
    sourceId,
    expectedSourceType,
    triggeredBy,
    initialJobCursor,
    validateResolvedConfig,
  } = params;

  const source = (await sourceDb().findUnique({ where: { id: sourceId } })) as Source | null;
  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }
  if (source.type !== expectedSourceType) {
    throw new Error(
      `Source ${sourceId} type ${source.type} does not match expected ${expectedSourceType}`
    );
  }

  const startedAt = new Date();
  const runId = randomUUID();

  const job = await prisma.ingestionJob.create({
    data: {
      sourceId,
      status: "RUNNING",
      triggeredBy,
      startedAt,
      cursor: initialJobCursor ?? null,
    },
  });

  const jobId = job.id;

  const ctx: IngestionContext = {
    sourceId,
    sourceType: expectedSourceType,
    jobId,
    runId,
    triggeredBy,
    startedAt,
  };

  const resultBuilder = new SyncResultBuilder();
  let jobCursor = initialJobCursor;
  let fatalError: string | undefined;

  const base: AdapterRuntimeConfigBase = {
    sourceId,
    sourceType: expectedSourceType,
    sourceConfigJson: source.config,
    sourceName: source.name,
    sourcePageUrl: source.pageUrl,
  };

  let resolvedConfig: TConfig;
  try {
    resolvedConfig = await adapter.resolveConfig(base);
    if (validateResolvedConfig) {
      await validateResolvedConfig(resolvedConfig);
    }
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err);
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error: fatalError,
        durationMs: Date.now() - startedAt.getTime(),
      },
    });
    await writeSyncLog(sourceId, jobId, "error", `Config validation failed: ${fatalError}`);
    resultBuilder.setFatalError(fatalError);
    const failedEarly = resultBuilder.build(ctx, "FAILED", new Date());
    await applyReliabilityAfterIngestionSafe({
      sourceId,
      jobStatus: "FAILED",
      totalFetched: failedEarly.totalFetched,
      totalNormalized: failedEarly.totalNormalized,
      totalStored: failedEarly.totalStored,
    });
    return failedEarly;
  }

  await writeSyncLog(sourceId, jobId, "info", "Job started", { runId });

  try {
    await sourceDb().update({
      where: { id: sourceId },
      data: { lastSyncAt: new Date() },
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = resultBuilder.openBatch(jobCursor);

      let fetchResult: Awaited<ReturnType<SourceAdapter<TConfig, TRaw>["fetchBatch"]>>;
      try {
        fetchResult = await adapter.fetchBatch({ ctx, jobCursor, limit: undefined }, resolvedConfig);
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        batch.addWarning(`Fetch batch failed: ${msg}`).close();
        fatalError = msg;
        resultBuilder.setFatalError(msg);
        await sourceDb().update({
          where: { id: sourceId },
          data: {
            status: "ERROR",
            lastError: msg,
            errorCount: { increment: 1 },
          },
        });
        await prisma.ingestionJob.update({
          where: { id: jobId },
          data: { error: msg, cursor: jobCursor ?? null },
        });
        break;
      }

      batch.setFetched(fetchResult.records.length);

      if (fetchResult.transportMetadata && Object.keys(fetchResult.transportMetadata).length > 0) {
        await writeSyncLog(sourceId, jobId, "info", "Batch transport", fetchResult.transportMetadata);
      }

      for (const record of fetchResult.records) {
        let persistedNew = false;
        try {
          const stored = await persistRawPayload({
            sourceId,
            jobId,
            sourceType: expectedSourceType,
            externalId: record.externalId,
            entityType: record.entityType,
            payload: record.payload,
          });
          persistedNew = stored.isNew;

          if (stored.skipNormalization) {
            batch.recordOutcome({
              externalId: record.externalId,
              entityType: record.entityType,
              isNew: persistedNew,
              normalized: false,
              recoverable: false,
              duplicateSuppressed: true,
            });
            continue;
          }

          const norm = adapter.normalize(ctx, record, stored.id);
          if (!norm.ok) {
            await prisma.rawRecord.update({
              where: { id: stored.id },
              data: {
                status: "FAILED",
                processingError: norm.failure.reason,
              },
            });
            batch.recordOutcome({
              externalId: record.externalId,
              entityType: record.entityType,
              isNew: persistedNew,
              normalized: false,
              error: norm.failure.reason,
              recoverable: true,
            });
            continue;
          }

          await applyMappingResult({ mapping: norm.mapping, rawRecordId: stored.id });
          for (const w of norm.mapping.warnings) {
            batch.addWarning(w);
          }
          batch.recordOutcome({
            externalId: record.externalId,
            entityType: record.entityType,
            isNew: persistedNew,
            normalized: true,
            recoverable: true,
          });
        } catch (recErr) {
          const msg = recErr instanceof Error ? recErr.message : String(recErr);
          logger.error("[persisted-sync] record pipeline error", {
            sourceId,
            jobId,
            externalId: record.externalId,
            error: msg,
          });
          batch.recordOutcome({
            externalId: record.externalId,
            entityType: record.entityType,
            isNew: persistedNew,
            normalized: false,
            error: msg,
            recoverable: true,
          });
        }
      }

      batch.close();

      jobCursor = fetchResult.nextCursor;
      resultBuilder.setFinalCursor(fetchResult.nextCursor);

      const summaryPartial = resultBuilder.build(ctx, "RUNNING", new Date());
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          totalFetched: summaryPartial.totalFetched,
          totalStored: summaryPartial.totalStored,
          totalNormalized: summaryPartial.totalNormalized,
          totalSkipped: summaryPartial.totalSkipped,
          totalFailed: summaryPartial.totalFailed,
          cursor: fetchResult.nextCursor ?? null,
        },
      });

      if (!fetchResult.hasMore) break;
    }

    if (!fatalError) {
      await sourceDb().update({
        where: { id: sourceId },
        data: { status: "ACTIVE", errorCount: 0, lastError: null },
      });
    }
  } catch (err) {
    fatalError = err instanceof Error ? err.message : String(err);
    resultBuilder.setFatalError(fatalError);
    await sourceDb().update({
      where: { id: sourceId },
      data: {
        status: "ERROR",
        lastError: fatalError,
        errorCount: { increment: 1 },
      },
    });
    await prisma.ingestionJob.update({
      where: { id: jobId },
      data: {
        error: fatalError,
        errorStack: err instanceof Error ? err.stack : null,
      },
    });
    await writeSyncLog(sourceId, jobId, "error", `Job failed: ${fatalError}`);
  }

  const completedAt = new Date();
  let status: JobStatus = "COMPLETED";
  if (fatalError) {
    status = "FAILED";
  } else {
    const prelim = resultBuilder.build(ctx, "COMPLETED", completedAt);
    if (prelim.totalFailed > 0 && prelim.totalFetched > 0) {
      status = "PARTIAL";
    }
  }

  const summary = resultBuilder.build(ctx, status, completedAt);

  await prisma.ingestionJob.update({
    where: { id: jobId },
    data: {
      status,
      completedAt,
      durationMs: summary.durationMs,
      totalFetched: summary.totalFetched,
      totalStored: summary.totalStored,
      totalNormalized: summary.totalNormalized,
      totalSkipped: summary.totalSkipped,
      totalFailed: summary.totalFailed,
      cursor: summary.finalCursor ?? null,
      metadata: {
        batchCount: summary.batchCount,
        warnings: summary.warnings,
      } as never,
    },
  });

  await writeSyncLog(sourceId, jobId, "info", `Job ${status.toLowerCase()}`, {
    durationMs: summary.durationMs,
    totalFetched: summary.totalFetched,
    totalNormalized: summary.totalNormalized,
    totalFailed: summary.totalFailed,
  });

  await applyReliabilityAfterIngestionSafe({
    sourceId,
    jobStatus: status,
    totalFetched: summary.totalFetched,
    totalNormalized: summary.totalNormalized,
    totalStored: summary.totalStored,
  });

  return summary;
}
