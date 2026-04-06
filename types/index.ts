// Mulify Library — Phase 1 Core Types
// All domain types and interfaces

export type SourceType = "META_ADS" | "SHOPIFY_STOREFRONT" | "MANUAL";
export type SourceStatus = "ACTIVE" | "PAUSED" | "ERROR" | "PENDING";
export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PARTIAL";
export type RecordStatus = "RAW" | "PROCESSING" | "NORMALIZED" | "FAILED" | "SKIPPED";
export type EntityType = "AD" | "STORE" | "PRODUCT" | "COLLECTION" | "LANDING_PAGE" | "ADVERTISER";
export type Platform = "FACEBOOK" | "INSTAGRAM" | "AUDIENCE_NETWORK" | "MESSENGER" | "UNKNOWN";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type LogLevel = "info" | "warn" | "error" | "debug";

// ─────────────────────────────────────────────────────────────
// SOURCE ADAPTER TYPES
// ─────────────────────────────────────────────────────────────

export interface SourceConfig {
  name: string;
  type: SourceType;
  enabled: boolean;
  rateLimit?: RateLimitConfig;
  retry?: RetryConfig;
}

export interface MetaSourceConfig extends SourceConfig {
  type: "META_ADS";
  accessToken: string;
  adLibrarySearchTerms?: string[];
  adLibraryCountries?: string[];
  adLibraryPageIds?: string[];
  adActiveStatus?: "ACTIVE" | "INACTIVE" | "ALL";
  adType?: "POLITICAL_AND_ISSUE_ADS" | "ALL";
}

export interface ShopifySourceConfig extends SourceConfig {
  type: "SHOPIFY_STOREFRONT";
  targetDomains: string[];
  fetchProducts?: boolean;
  fetchCollections?: boolean;
  fetchStoreMeta?: boolean;
  maxProductsPerStore?: number;
  maxCollectionsPerStore?: number;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour?: number;
  burstLimit?: number;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

// ─────────────────────────────────────────────────────────────
// ADAPTER INTERFACE
// ─────────────────────────────────────────────────────────────

export interface FetchBatchOptions {
  cursor?: string;
  limit?: number;
  jobId?: string;
}

export interface FetchBatchResult<T = unknown> {
  records: T[];
  nextCursor?: string;
  hasMore: boolean;
  totalFetched: number;
  rateLimitRemaining?: number;
}

export interface AdapterRunResult {
  jobId: string;
  status: JobStatus;
  totalFetched: number;
  totalStored: number;
  totalNormalized: number;
  totalSkipped: number;
  totalFailed: number;
  durationMs: number;
  error?: string;
  warnings?: string[];
  batchCount?: number;
  finalCursor?: string;
}

// ─────────────────────────────────────────────────────────────
// RAW PAYLOADS (as received from sources — typed loosely)
// ─────────────────────────────────────────────────────────────

// Meta Ad Library API response shape
// Note: Meta Ad Library access is limited; fields vary based on permissions
export interface MetaAdRawPayload {
  id: string;
  page_id?: string;
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_captions?: string[];
  ad_creative_link_descriptions?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
  ad_snapshot_url?: string;
  currency?: string;
  delivery_by_region?: Array<{ region: string; percentage: string }>;
  demographic_distribution?: Array<{ age: string; gender: string; percentage: string }>;
  impressions?: { lower_bound: string; upper_bound: string };
  spend?: { lower_bound: string; upper_bound: string };
  publisher_platforms?: string[];
  languages?: string[];
  bylines?: string;
  target_ages?: string[];
  target_gender?: string;
  target_locations?: Array<{ name: string; type: string }>;
  // Destination URL is NOT directly available in Ad Library API
  // It may be inferred from ad_snapshot_url or linked page metadata
  _fetchedAt?: string;
}

// Shopify storefront JSON API response shapes
export interface ShopifyProductRawPayload {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string;
  tags?: string;
  variants?: ShopifyVariantRaw[];
  images?: ShopifyImageRaw[];
  options?: Array<{ name: string; values: string[] }>;
  _storeDomain?: string;
  _fetchedAt?: string;
}

export interface ShopifyVariantRaw {
  id: number;
  title: string;
  price: string;
  compare_at_price?: string;
  available?: boolean;
  inventory_quantity?: number;
  sku?: string;
}

export interface ShopifyImageRaw {
  id: number;
  src: string;
  position: number;
  alt?: string;
}

export interface ShopifyCollectionRawPayload {
  id: number;
  handle: string;
  title: string;
  description?: string;
  image?: { src: string };
  products_count?: number;
  _storeDomain?: string;
  _fetchedAt?: string;
}

export interface ShopifyStoreMetaRawPayload {
  domain: string;
  /** Host actually requested (may match canonical or be a redirect target). */
  fetchHost?: string;
  configuredSourceDomain?: string;
  storeUrlHostname?: string;
  myshopifyHost?: string;
  primaryDomainFromResponse?: string;
  domainAliases?: string[];
  name?: string;
  description?: string;
  currency?: string;
  country?: string;
  moneyFormat?: string;
  shopifyTheme?: string;
  _fetchedAt?: string;
}

// ─────────────────────────────────────────────────────────────
// NORMALIZED ENTITY TYPES
// ─────────────────────────────────────────────────────────────

export interface NormalizedAd {
  externalId: string;
  pageId?: string;
  pageName?: string;
  pageUrl?: string;
  adText?: string;
  adTitle?: string;
  adBody?: string;
  callToAction?: string;
  adImageUrl?: string;
  adVideoUrl?: string;
  destinationUrl?: string;
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
  metadata?: Record<string, unknown>;
}

export interface NormalizedStore {
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
  metadata?: Record<string, unknown>;
}

export interface NormalizedProduct {
  storeId: string;
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
  metadata?: Record<string, unknown>;
}

export interface NormalizedCollection {
  storeId: string;
  externalId?: string;
  handle: string;
  title: string;
  description?: string;
  url: string;
  canonicalUrl: string;
  featuredImage?: string;
  productCount?: number;
  metadata?: Record<string, unknown>;
}

export interface NormalizedLandingPage {
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
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// CONFIDENCE SCORING TYPES
// ─────────────────────────────────────────────────────────────

export interface ConfidenceBreakdown {
  sourceScore: number;
  completenessScore: number;
  confirmationScore: number;
  urlValidityScore: number;
  linkageScore: number;
  details: Record<string, unknown>;
}

export interface ConfidenceInput {
  entityType: EntityType;
  entityId: string;
  isOfficialApiSource: boolean;
  fieldCompleteness: number; // 0–1
  syncCount: number;
  hasValidUrls: boolean;
  linkedEntityCount: number;
  previousScore?: number;
}

export interface ScoredConfidence extends ConfidenceBreakdown {
  overallScore: number;
  level: ConfidenceLevel;
  syncCount: number;
}

// ─────────────────────────────────────────────────────────────
// JOB TYPES
// ─────────────────────────────────────────────────────────────

export interface JobRunOptions {
  sourceId: string;
  triggeredBy?: string;
  cursor?: string;
  limit?: number;
}

export interface JobProgress {
  jobId: string;
  status: JobStatus;
  fetched: number;
  stored: number;
  normalized: number;
  skipped: number;
  failed: number;
}

// ─────────────────────────────────────────────────────────────
// API RESPONSE TYPES (for admin UI)
// ─────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface ConfidenceDistribution {
  high: number;
  medium: number;
  low: number;
}

export interface DashboardStats {
  totalAds: number;
  totalStores: number;
  totalProducts: number;
  totalCollections: number;
  totalLandingPages: number;
  totalRawRecords: number;
  totalSources: number;
  activeSources: number;
  sourcesInError: number;
  activeJobs: number;
  failedJobs24h: number;
  partialJobs24h: number;
  rawRecordsFailed: number;
  rawRecordsNormalized: number;
  entitiesLowConfidence: number;
  confidenceAds: ConfidenceDistribution;
  lastSyncAt?: Date;
  recentJobs: JobSummary[];
}

export interface JobSummary {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: SourceType;
  status: JobStatus;
  triggeredBy: string;
  startedAt?: Date;
  completedAt?: Date;
  totalFetched: number;
  totalNormalized: number;
  totalFailed: number;
  createdAt: Date;
}
