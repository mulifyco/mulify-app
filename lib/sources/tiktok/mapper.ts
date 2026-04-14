/**
 * TikTok raw → portable mapping contract (Ad + Landing page stubs).
 */

import type {
  AdUpsertInput,
  ConfidenceHint,
  LandingPageUpsertInput,
  MappingFailure,
  MappingResult,
  NormalizationOutcome,
} from "@/lib/sources/shared/types";
import { extractDomain, extractPath, isValidUrl, normalizeUrl } from "@/lib/url";
import type { TikTokPageRawLandingPayload, TikTokPageRawVideoPayload } from "./types";

function likelyShopifyFromUrlOrPath(urlOrPath: string): boolean {
  const s = urlOrPath.toLowerCase();
  if (s.includes("myshopify.com")) return true;
  if (s.includes("cdn.shopify.com")) return true;
  if (s.includes("/cart.js")) return true;
  if (s.includes("/products.json")) return true;
  if (s.includes("/collections.json")) return true;
  if (s.includes("/products/")) return true;
  if (s.includes("/collections/")) return true;
  if (s.includes("/checkouts/")) return true;
  return false;
}

export function mapTikTokVideo(raw: TikTokPageRawVideoPayload, rawRecordId: string): NormalizationOutcome {
  if (!raw.videoId?.trim()) {
    return {
      ok: false,
      failure: { reason: "TikTok video payload missing videoId", rawPayloadSnapshot: raw },
    };
  }

  const warnings: string[] = [];
  const creativeUrl = raw.creativeUrl?.trim() || "";
  if (!creativeUrl || !isValidUrl(creativeUrl)) {
    warnings.push("TikTok creativeUrl missing or invalid — cluster fingerprint may be weak");
  }

  const destination =
    raw.outboundUrl?.trim() && isValidUrl(raw.outboundUrl)
      ? normalizeUrl(raw.outboundUrl) ?? raw.outboundUrl
      : undefined;

  const ad: AdUpsertInput = {
    externalId: `tiktok:video:${raw.videoId}`,
    platform: "TIKTOK",
    creativeType: "VIDEO",
    creativeUrl: creativeUrl || undefined,
    thumbnailUrl: raw.thumbnailUrl?.trim() || undefined,
    pageId: raw.handle ?? undefined,
    pageName: raw.handle ? `@${raw.handle}` : undefined,
    pageUrl: raw.profileUrl ?? undefined,
    adText: raw.caption?.trim() || undefined,
    destinationUrl: destination,
    canonicalUrl: creativeUrl || undefined,
    adVideoUrl: creativeUrl || undefined,
    platforms: ["TIKTOK"],
    countries: [],
    isActive: true,
    metadata: {
      platform: "TIKTOK",
      source: "tiktok_page",
      videoId: raw.videoId,
      bioLinks: raw.bioLinks,
      hookPhrase: raw.hookPhrase ?? undefined,
      hashtags: raw.hashtags ?? [],
      musicId: raw.musicId ?? undefined,
      musicTitle: raw.musicTitle ?? undefined,
      fetchedAt: raw.fetchedAt,
    },
    rawRecordId,
  };

  const confidence: ConfidenceHint = {
    isOfficialApiSource: false,
    fieldCompleteness: raw.thumbnailUrl ? 0.72 : 0.55,
    hasValidUrls: Boolean(creativeUrl && isValidUrl(creativeUrl)),
    missingFields: raw.caption ? [] : ["caption"],
    uncertainFields: ["isActive", "destinationUrl"],
  };

  return {
    ok: true,
    mapping: {
      entity: { type: "AD", data: ad },
      confidence,
      warnings,
    },
  };
}

export function mapTikTokOutboundLanding(
  raw: TikTokPageRawLandingPayload,
  rawRecordId: string
): NormalizationOutcome {
  const urlRaw = raw.url?.trim();
  if (!urlRaw) {
    return {
      ok: false,
      failure: { reason: "TikTok landing payload missing url", rawPayloadSnapshot: raw },
    };
  }

  const canonical = normalizeUrl(urlRaw) ?? urlRaw;
  const domain = extractDomain(canonical);
  if (!domain) {
    return {
      ok: false,
      failure: { reason: "Could not extract domain from outbound URL", rawPayloadSnapshot: raw },
    };
  }

  const lp: LandingPageUpsertInput = {
    url: canonical,
    domain,
    path: extractPath(canonical),
    hasShopifySignal: likelyShopifyFromUrlOrPath(canonical) || likelyShopifyFromUrlOrPath(extractPath(canonical)),
    metadata: {
      tiktokOutbound: true,
      fetchedAt: raw.fetchedAt,
    },
    rawRecordId,
  };

  const confidence: ConfidenceHint = {
    isOfficialApiSource: false,
    fieldCompleteness: 0.4,
    hasValidUrls: isValidUrl(canonical),
    missingFields: ["title", "description"],
    uncertainFields: ["hasShopifySignal"],
  };

  const result: MappingResult = {
    entity: { type: "LANDING_PAGE", data: lp },
    confidence,
    warnings: [],
  };

  return { ok: true, mapping: result };
}

export function tiktokNormalizeRecord(
  record: { entityType: string; payload: unknown },
  rawRecordId: string
): NormalizationOutcome {
  if (record.entityType === "AD") {
    return mapTikTokVideo(record.payload as TikTokPageRawVideoPayload, rawRecordId);
  }
  if (record.entityType === "LANDING_PAGE") {
    return mapTikTokOutboundLanding(record.payload as TikTokPageRawLandingPayload, rawRecordId);
  }
  return {
    ok: false,
    failure: {
      reason: `Unsupported TikTok entityType: ${record.entityType}`,
      rawPayloadSnapshot: record.payload,
    },
  };
}
