/**
 * Shared contracts between fetch clients, adapters, normalizers, and persistence.
 * Intentionally decoupled from Prisma — portable across jobs, tests, and future workers.
 */

import type { SourceType, JobStatus, Platform, CreativeType } from "@/types";

export type { SourceType, JobStatus, Platform };

export type RawEntityType =
  | "AD"
  | "STORE"
  | "PRODUCT"
  | "COLLECTION"
  | "LANDING_PAGE"
  | "ADVERTISER";

// ─── Ingestion context ─────────────────────────────────────────────────────

export interface IngestionContext {
  readonly sourceId: string;
  readonly sourceType: SourceType;
  readonly jobId: string;
  readonly runId: string;
  readonly triggeredBy: string;
  readonly startedAt: Date;
}

// ─── Cursor / pagination (serialisable for IngestionJob.cursor) ─────────────

export interface SyncCursorState {
  cursor?: string;
  page?: number;
  domainIndex?: number;
  lastExternalId?: string;
  /** Shopify-specific: encoded opaque state */
  shopify?: ShopifySyncCursorV1;
}

/** Paginate /collections/{handle}/products.json when /products.json is empty. */
export interface ShopifyCollectionProductsFanoutV1 {
  handles: string[];
  handleIdx: number;
  page: number;
  /** Resume index within the current collection products page (0-based). */
  startOffset?: number;
}

/** Versioned cursor for Shopify public JSON pagination (retry-safe). */
export interface ShopifySyncCursorV1 {
  v: 1;
  domainIndex: number;
  phase: "store_meta" | "products" | "collections";
  page: number;
  productsEmitted?: number;
  collectionsEmitted?: number;
  collectionProductsFanout?: ShopifyCollectionProductsFanoutV1 | null;
}

export function encodeCursor(state: SyncCursorState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeCursor(encoded: string | undefined | null): SyncCursorState {
  if (!encoded) return {};
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SyncCursorState;
  } catch {
    return {};
  }
}

// ─── Raw envelope (one logical unit to persist + normalize) ─────────────────

export interface RawPayloadRecord<TRaw = unknown> {
  externalId: string;
  entityType: RawEntityType;
  payload: TRaw;
  /** Ingestion wall-clock (ISO) — distinct from source-provided timestamps. */
  ingestionTimestamp: string;
  sourceMetadata?: Record<string, unknown>;
}

// ─── Fetch batch ───────────────────────────────────────────────────────────

export interface AdapterFetchBatchResult<TRaw = unknown> {
  records: RawPayloadRecord<TRaw>[];
  nextCursor?: string;
  hasMore: boolean;
  totalFetched: number;
  rateLimitRemaining?: number;
  /** Optional opaque hints from the HTTP layer (e.g. Meta x-app-usage). */
  transportMetadata?: Record<string, unknown>;
}

// ─── Adapter config (runtime merge of DB row + env) ────────────────────────

export interface AdapterRuntimeConfigBase {
  sourceId: string;
  sourceType: SourceType;
  /** Raw JSON.config from Source row — validated per adapter. */
  sourceConfigJson: unknown;
  /** Source row name — optional log context only. */
  sourceName?: string | null;
  /** Optional `Source.pageUrl` for types that read the column (e.g. TikTok profile). */
  sourcePageUrl?: string | null;
}

// ─── Normalization outcome ───────────────────────────────────────────────────

export type NormalizationOutcome =
  | { ok: true; mapping: MappingResult }
  | { ok: false; failure: MappingFailure };

// ─── Adapter capabilities (documentation for operators) ─────────────────────

export interface AdapterCapabilities {
  supportsPagination: boolean;
  supportsResume: boolean;
  supportsIncrementalSync: boolean;
  maxPageSize: number;
  rateLimitDescription: string;
  knownLimitations: string[];
}

// ─── Per-record processing ─────────────────────────────────────────────────

export interface RecordProcessingOutcome {
  externalId: string;
  entityType: RawEntityType;
  isNew: boolean;
  normalized: boolean;
  warning?: string;
  error?: string;
  recoverable: boolean;
  /** Same payload hash as prior ingest — normalization intentionally skipped. */
  duplicateSuppressed?: boolean;
}

// ─── Batch / run metrics ─────────────────────────────────────────────────────

export interface BatchMetrics {
  batchIndex: number;
  cursorIn?: string;
  fetched: number;
  stored: number;
  normalized: number;
  skipped: number;
  failed: number;
  warnings: string[];
  recoverableErrors: Array<{ externalId?: string; message: string }>;
  durationMs: number;
}

export interface SyncRunSummary {
  jobId: string;
  sourceId: string;
  sourceType: SourceType;
  triggeredBy: string;
  status: JobStatus;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  totalFetched: number;
  totalStored: number;
  totalNormalized: number;
  totalSkipped: number;
  totalFailed: number;
  batchCount: number;
  warnings: string[];
  fatalError?: string;
  finalCursor?: string;
  batches: BatchMetrics[];
}

// ─── Persistence-facing inputs (repository / apply-layer) ──────────────────

export interface AdUpsertInput {
  externalId: string;
  /** Primary platform on `Ad` (clustering / boards); falls back to first of `platforms` when omitted. */
  platform?: Platform;
  creativeType?: CreativeType;
  creativeUrl?: string;
  thumbnailUrl?: string;
  pageId?: string;
  pageName?: string;
  pageUrl?: string;
  adText?: string;
  adTitle?: string;
  adBody?: string;
  callToAction?: string;
  adImageUrl?: string;
  adVideoUrl?: string;
  /**
   * Rarely available from Ad Library; often unknown without separate enrichment.
   */
  destinationUrl?: string;
  /**
   * Typically the Meta-hosted snapshot/preview URL — not the advertiser landing page.
   */
  canonicalUrl?: string;
  platforms: Platform[];
  countries: string[];
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
  impressionsMin?: number;
  impressionsMax?: number;
  spendMin?: number;
  spendMax?: number;
  currency?: string;
  metadata: Record<string, unknown>;
  rawRecordId: string;
}

export interface StoreUpsertInput {
  domain: string;
  name?: string;
  description?: string;
  platform: string;
  country?: string;
  currency?: string;
  language?: string;
  logoUrl?: string;
  metaTitle?: string;
  metaDescription?: string;
  socialLinks?: Record<string, string>;
  tags: string[];
  metadata: Record<string, unknown>;
  rawRecordId: string;
}

export interface ProductUpsertInput {
  storeDomain: string;
  externalId?: string;
  handle: string;
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  tags: string[];
  url: string;
  canonicalUrl: string;
  featuredImage?: string;
  images: string[];
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  isAvailable?: boolean;
  publishedAt?: Date;
  metadata: Record<string, unknown>;
  rawRecordId: string;
  /** Collection handles referenced on the product JSON-LD or future crawl — often empty. */
  collectionHandles?: string[];
}

export interface CollectionUpsertInput {
  storeDomain: string;
  externalId?: string;
  handle: string;
  title: string;
  description?: string;
  url: string;
  canonicalUrl: string;
  featuredImage?: string;
  productCount?: number;
  metadata: Record<string, unknown>;
  rawRecordId: string;
}

export interface LandingPageUpsertInput {
  url: string;
  domain: string;
  path: string;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  h1Text?: string;
  hasCheckout?: boolean;
  hasShopifySignal?: boolean;
  httpStatus?: number;
  metadata: Record<string, unknown>;
  rawRecordId?: string;
}

export type MappedEntity =
  | { type: "AD"; data: AdUpsertInput }
  | { type: "STORE"; data: StoreUpsertInput }
  | { type: "PRODUCT"; data: ProductUpsertInput }
  | { type: "COLLECTION"; data: CollectionUpsertInput }
  | { type: "LANDING_PAGE"; data: LandingPageUpsertInput };

export interface ConfidenceHint {
  isOfficialApiSource: boolean;
  fieldCompleteness: number;
  hasValidUrls: boolean;
  missingFields: string[];
  uncertainFields: string[];
}

export interface MappingResult {
  entity: MappedEntity;
  confidence: ConfidenceHint;
  warnings: string[];
  enrichmentHints?: Record<string, unknown>;
}

export interface MappingFailure {
  externalId?: string;
  reason: string;
  rawPayloadSnapshot?: unknown;
}
