/**
 * Shared source adapter abstraction — fetch + normalize only.
 * Persistence is handled by a separate apply-layer so this stays testable.
 */

import type { IngestionContext } from "./types";
import type {
  AdapterFetchBatchResult,
  AdapterRuntimeConfigBase,
  NormalizationOutcome,
  RawPayloadRecord,
  AdapterCapabilities,
} from "./types";

/**
 * Hooks for structured logs (Prisma SyncLog, stdout in tests, etc.).
 */
export interface IngestionLogHooks {
  debug(message: string, data?: Record<string, unknown>): Promise<void> | void;
  info(message: string, data?: Record<string, unknown>): Promise<void> | void;
  warn(message: string, data?: Record<string, unknown>): Promise<void> | void;
  error(message: string, data?: Record<string, unknown>): Promise<void> | void;
}

/**
 * `jobCursor` is the opaque string persisted on IngestionJob.cursor between batches.
 * Each adapter defines how it encodes pagination state (Meta: Graph `after` token;
 * Shopify: base64 JSON via encodeCursor in shared types).
 */
export interface SourceFetchBatchParams {
  ctx: IngestionContext;
  jobCursor?: string;
  limit?: number;
}

/**
 * Every external source implements this contract.
 * Persistence is handled outside the adapter (apply-layer + raw store).
 */
export interface SourceAdapter<TConfig, TRaw> {
  readonly capabilities: AdapterCapabilities;

  /** Merge env + Source row into a typed config; throw if invalid. */
  resolveConfig(base: AdapterRuntimeConfigBase): Promise<TConfig> | TConfig;

  fetchBatch(
    params: SourceFetchBatchParams,
    config: TConfig
  ): Promise<AdapterFetchBatchResult<TRaw>>;

  /**
   * Pure normalization: raw DB id is injected so persistence inputs reference RawRecord.
   */
  normalize(
    ctx: IngestionContext,
    record: RawPayloadRecord<TRaw>,
    rawRecordId: string
  ): NormalizationOutcome;
}
