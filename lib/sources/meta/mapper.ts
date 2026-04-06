/**
 * Pure Meta Ad Library → persistence contract mapping.
 * No I/O. Reflects field optionality honestly (political vs non-political, API limits).
 */

import type { MetaAdRawPayload, Platform } from "@/types";
import type {
  AdUpsertInput,
  ConfidenceHint,
  MappingFailure,
  MappingResult,
  NormalizationOutcome,
} from "@/lib/sources/shared/types";
import { normalizeUrl, isValidUrl } from "@/lib/url";
import { parseDate } from "@/lib/date";

const TRACKED_FIELDS: (keyof MetaAdRawPayload)[] = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "publisher_platforms",
  "ad_delivery_start_time",
];

export type MapMetaAdResult =
  | { ok: true; result: MappingResult }
  | { ok: false; failure: MappingFailure };

export function mapMetaAd(raw: MetaAdRawPayload, rawRecordId: string): MapMetaAdResult {
  if (!raw.id) {
    return {
      ok: false,
      failure: {
        reason: "Raw payload missing required field: id",
        rawPayloadSnapshot: raw,
      },
    };
  }

  const warnings: string[] = [];
  const missingFields: string[] = [];
  const uncertainFields: string[] = [];

  const adText = extractAdText(raw.ad_creative_bodies);
  const adTitle = extractAdText(raw.ad_creative_link_titles);
  const adBody = extractAdText(raw.ad_creative_link_descriptions);

  if (!adText && !adTitle) {
    missingFields.push("ad_creative_bodies", "ad_creative_link_titles");
    warnings.push(`Ad ${raw.id}: no readable text content returned by API`);
  }

  if (!raw.page_id) missingFields.push("page_id");
  if (!raw.page_name) missingFields.push("page_name");

  const pageUrl = raw.page_id ? `https://www.facebook.com/${raw.page_id}` : undefined;

  const platforms = normalizePlatforms(raw.publisher_platforms ?? []);
  if (platforms.length === 0) {
    missingFields.push("publisher_platforms");
  }

  const startDate = parseDate(raw.ad_delivery_start_time);
  const endDate = parseDate(raw.ad_delivery_stop_time);

  if (!startDate) missingFields.push("ad_delivery_start_time");

  /**
   * "Active" is not an explicit API boolean. Absence of stop time often means still
   * running, but the API can omit stop time for other reasons — mark uncertain.
   */
  const isActive = endDate ? false : true;
  uncertainFields.push("isActive");

  const impressionsMin = raw.impressions?.lower_bound
    ? parseIntSafe(raw.impressions.lower_bound)
    : undefined;
  const impressionsMax = raw.impressions?.upper_bound
    ? parseIntSafe(raw.impressions.upper_bound)
    : undefined;
  const spendMin = raw.spend?.lower_bound ? parseFloatSafe(raw.spend.lower_bound) : undefined;
  const spendMax = raw.spend?.upper_bound ? parseFloatSafe(raw.spend.upper_bound) : undefined;

  const countries = extractCountries(raw.delivery_by_region);

  const snapshotUrl = raw.ad_snapshot_url
    ? normalizeUrl(raw.ad_snapshot_url) ?? undefined
    : undefined;

  if (!snapshotUrl && raw.ad_snapshot_url) {
    warnings.push(`Ad ${raw.id}: ad_snapshot_url could not be normalized`);
  }

  const hasValidUrls = snapshotUrl ? isValidUrl(snapshotUrl) : false;

  const ad: AdUpsertInput = {
    externalId: raw.id,
    pageId: raw.page_id,
    pageName: raw.page_name,
    pageUrl,
    adText,
    adTitle,
    adBody,
    canonicalUrl: snapshotUrl,
    platforms,
    countries,
    startDate,
    endDate,
    isActive,
    impressionsMin,
    impressionsMax,
    spendMin,
    spendMax,
    currency: raw.currency,
    metadata: buildMetadata(raw, {
      destinationUrlStatus:
        "UNCERTAIN: Ad Library typically does not expose final landing URLs; political datasets may differ.",
      languages: raw.languages ?? [],
      bylines: raw.bylines,
      uncertainFields,
    }),
    rawRecordId,
  };

  const filledTracked = TRACKED_FIELDS.filter(
    (f) => raw[f] !== undefined && raw[f] !== null
  ).length;
  const fieldCompleteness = filledTracked / TRACKED_FIELDS.length;

  const confidence: ConfidenceHint = {
    isOfficialApiSource: true,
    fieldCompleteness,
    hasValidUrls,
    missingFields,
    uncertainFields,
  };

  return {
    ok: true,
    result: {
      entity: { type: "AD", data: ad },
      confidence,
      warnings,
      enrichmentHints: snapshotUrl
        ? {
            snapshotUrl,
            note: "Optional Phase 2: resolve snapshot / outbound links for landing URL candidates",
          }
        : undefined,
    },
  };
}

export function metaMapToNormalizationOutcome(
  raw: MetaAdRawPayload,
  rawRecordId: string
): NormalizationOutcome {
  const r = mapMetaAd(raw, rawRecordId);
  if (r.ok) return { ok: true, mapping: r.result };
  return { ok: false, failure: r.failure };
}

export function extractAdText(values: string[] | undefined | null): string | undefined {
  if (!values?.length) return undefined;
  const joined = values
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(" ");
  return joined || undefined;
}

export function normalizePlatforms(raw: string[]): Platform[] {
  const platformMap: Record<string, Platform> = {
    facebook: "FACEBOOK",
    instagram: "INSTAGRAM",
    audience_network: "AUDIENCE_NETWORK",
    messenger: "MESSENGER",
  };
  return raw.map((p) => platformMap[p.toLowerCase()] ?? "UNKNOWN");
}

export function extractCountries(
  regions: Array<{ region: string; percentage: string }> | undefined
): string[] {
  if (!regions?.length) return [];
  return [...new Set(regions.map((r) => r.region).filter(Boolean))];
}

function parseIntSafe(s: string): number | undefined {
  const n = parseInt(s, 10);
  return isNaN(n) ? undefined : n;
}

function parseFloatSafe(s: string): number | undefined {
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
}

function buildMetadata(raw: MetaAdRawPayload, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    adSnapshotUrl: raw.ad_snapshot_url,
    fetchedAt: raw._fetchedAt,
    ...extra,
  };
}

export function mapMetaAdBatch(
  records: Array<{ raw: MetaAdRawPayload; rawRecordId: string }>
): {
  results: Array<{ rawRecordId: string; mapping: MappingResult }>;
  failures: Array<{ rawRecordId: string; failure: MappingFailure }>;
} {
  const results: Array<{ rawRecordId: string; mapping: MappingResult }> = [];
  const failures: Array<{ rawRecordId: string; failure: MappingFailure }> = [];

  for (const { raw, rawRecordId } of records) {
    const mapped = mapMetaAd(raw, rawRecordId);
    if (mapped.ok) {
      results.push({ rawRecordId, mapping: mapped.result });
    } else {
      failures.push({ rawRecordId, failure: mapped.failure });
    }
  }

  return { results, failures };
}
