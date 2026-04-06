import type { EntityType, RecordStatus, SourceType } from "@/types";

export function parseDateParam(value: string | undefined): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseConfidence(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseBoolParam(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

const ENTITY_TYPES: readonly EntityType[] = [
  "AD",
  "STORE",
  "PRODUCT",
  "COLLECTION",
  "LANDING_PAGE",
  "ADVERTISER",
];

const RECORD_STATUSES: readonly RecordStatus[] = [
  "RAW",
  "PROCESSING",
  "NORMALIZED",
  "FAILED",
  "SKIPPED",
];

const SOURCE_TYPES: readonly SourceType[] = ["META_ADS", "SHOPIFY_STOREFRONT", "MANUAL"];

export function parseEntityTypeParam(v: string | undefined): EntityType | undefined {
  if (!v) return undefined;
  return ENTITY_TYPES.includes(v as EntityType) ? (v as EntityType) : undefined;
}

export function parseRecordStatusParam(v: string | undefined): RecordStatus | undefined {
  if (!v) return undefined;
  return RECORD_STATUSES.includes(v as RecordStatus) ? (v as RecordStatus) : undefined;
}

export function parseSourceTypeParam(v: string | undefined): SourceType | undefined {
  if (!v) return undefined;
  return SOURCE_TYPES.includes(v as SourceType) ? (v as SourceType) : undefined;
}

/** Raw records: firstSeenAt >= now - window */
export function parseRecentIngestParam(v: string | undefined): Date | undefined {
  if (v === "24h") return new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (v === "7d") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return undefined;
}

export function parseLinkedFilterParam(
  v: string | undefined
): "linked" | "unlinked" | undefined {
  if (v === "linked") return "linked";
  if (v === "unlinked") return "unlinked";
  return undefined;
}

export function parsePositiveIntParam(v: string | undefined): number | undefined {
  if (!v?.trim()) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
