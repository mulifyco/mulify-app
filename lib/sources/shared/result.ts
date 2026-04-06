/**
 * Incremental metrics for ingestion runs — keeps batch loops readable.
 */

import type {
  BatchMetrics,
  IngestionContext,
  RecordProcessingOutcome,
  SyncRunSummary,
} from "./types";
import type { JobStatus } from "@/types";

export class SyncResultBuilder {
  private readonly batches: BatchMetrics[] = [];
  private readonly runWarnings: string[] = [];
  private fatalError: string | undefined;
  private finalCursor: string | undefined;

  openBatch(cursorIn?: string): BatchBuilder {
    return new BatchBuilder(this.batches.length, cursorIn, (metrics) => {
      this.batches.push(metrics);
    });
  }

  addWarning(message: string): void {
    this.runWarnings.push(message);
  }

  setFatalError(message: string): void {
    this.fatalError = message;
  }

  setFinalCursor(cursor: string | undefined): void {
    this.finalCursor = cursor;
  }

  build(
    context: IngestionContext,
    status: JobStatus,
    completedAt = new Date()
  ): SyncRunSummary {
    let totalFetched = 0;
    let totalStored = 0;
    let totalNormalized = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    const allWarnings: string[] = [...this.runWarnings];

    for (const batch of this.batches) {
      totalFetched += batch.fetched;
      totalStored += batch.stored;
      totalNormalized += batch.normalized;
      totalSkipped += batch.skipped;
      totalFailed += batch.failed;
      allWarnings.push(...batch.warnings);
    }

    return {
      jobId: context.jobId,
      sourceId: context.sourceId,
      sourceType: context.sourceType,
      triggeredBy: context.triggeredBy,
      status,
      startedAt: context.startedAt,
      completedAt,
      durationMs: completedAt.getTime() - context.startedAt.getTime(),
      totalFetched,
      totalStored,
      totalNormalized,
      totalSkipped,
      totalFailed,
      batchCount: this.batches.length,
      warnings: allWarnings,
      fatalError: this.fatalError,
      finalCursor: this.finalCursor,
      batches: this.batches,
    };
  }
}

export class BatchBuilder {
  private readonly startedAt = Date.now();
  private fetched = 0;
  private stored = 0;
  private normalized = 0;
  private skipped = 0;
  private failed = 0;
  private readonly warnings: string[] = [];
  private readonly recoverableErrors: Array<{ externalId?: string; message: string }> = [];
  private closed = false;

  constructor(
    private readonly index: number,
    private readonly cursorIn: string | undefined,
    private readonly onClose: (metrics: BatchMetrics) => void
  ) {}

  setFetched(count: number): this {
    this.fetched = count;
    return this;
  }

  recordOutcome(outcome: RecordProcessingOutcome): this {
    if (outcome.isNew) {
      this.stored++;
    } else {
      this.skipped++;
    }

    if (outcome.normalized) {
      this.normalized++;
    } else {
      this.failed++;
    }

    if (outcome.warning) {
      this.warnings.push(`[${outcome.externalId}] ${outcome.warning}`);
    }

    if (outcome.error && outcome.recoverable) {
      this.recoverableErrors.push({
        externalId: outcome.externalId,
        message: outcome.error,
      });
    }

    return this;
  }

  addWarning(message: string): this {
    this.warnings.push(message);
    return this;
  }

  close(): BatchMetrics {
    if (this.closed) {
      throw new Error("BatchBuilder.close() called twice");
    }
    this.closed = true;

    const metrics: BatchMetrics = {
      batchIndex: this.index,
      cursorIn: this.cursorIn,
      fetched: this.fetched,
      stored: this.stored,
      normalized: this.normalized,
      skipped: this.skipped,
      failed: this.failed,
      warnings: this.warnings,
      recoverableErrors: this.recoverableErrors,
      durationMs: Date.now() - this.startedAt,
    };

    this.onClose(metrics);
    return metrics;
  }
}
