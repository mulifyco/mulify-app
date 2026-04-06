/**
 * Public storefront JSON → portable persistence contracts (no DB).
 */

import type {
  ConfidenceHint,
  MappingResult,
  NormalizationOutcome,
  RawPayloadRecord,
} from "@/lib/sources/shared/types";
import { parseDate } from "@/lib/date";
import { logger } from "@/lib/logger";
import {
  buildShopifyCollectionUrl,
  buildShopifyProductUrl,
  isValidUrl,
  normalizeShopifyDomain,
  normalizeUrl,
} from "@/lib/url";
import type { ShopifyIntelligenceRaw } from "./types";

const STORE_TRACKED = ["domain", "currency", "name"] as const;
const PRODUCT_TRACKED = ["handle", "title", "vendor", "url", "featuredImage", "priceMin"] as const;

function completeness(
  obj: Record<string, unknown>,
  keys: readonly string[]
): { ratio: number; missing: string[] } {
  const missing: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined || v === null || v === "") missing.push(k);
  }
  return { ratio: (keys.length - missing.length) / keys.length, missing };
}

export function normalizeShopifyRecord(
  record: RawPayloadRecord<ShopifyIntelligenceRaw>,
  rawRecordId: string
): NormalizationOutcome {
  const p = record.payload;
  try {
    switch (p._ingestionKind) {
      case "STORE":
        return mapStore(p, rawRecordId, record.ingestionTimestamp);
      case "PRODUCT":
        return mapProduct(p, rawRecordId);
      case "COLLECTION":
        return mapCollection(p, rawRecordId);
      default:
        return {
          ok: false,
          failure: {
            reason: "Unknown Shopify ingestion payload shape",
            rawPayloadSnapshot: p,
          },
        };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.warn("shopify.normalizer.record_failed", {
      kind: p._ingestionKind,
      rawRecordId,
      error: msg,
    });
    return {
      ok: false,
      failure: {
        reason: `Normalization error: ${msg}`,
        rawPayloadSnapshot: p,
      },
    };
  }
}

function mapStore(
  raw: Extract<ShopifyIntelligenceRaw, { _ingestionKind: "STORE" }>,
  rawRecordId: string,
  ingestionTimestamp: string
): NormalizationOutcome {
  const domain = normalizeShopifyDomain(raw.domain);
  if (!domain) {
    return { ok: false, failure: { reason: "Store record missing domain", rawPayloadSnapshot: raw } };
  }

  const fieldObj: Record<string, unknown> = {
    domain,
    currency: raw.currency,
    name: raw.name,
  };
  const { ratio, missing } = completeness(fieldObj, STORE_TRACKED as unknown as string[]);

  const data = {
    domain,
    name: raw.name,
    description: raw.description,
    platform: "shopify",
    country: raw.country,
    currency: raw.currency,
    tags: [] as string[],
    metadata: {
      fetchedAt: raw._fetchedAt ?? ingestionTimestamp,
      moneyFormat: raw.moneyFormat,
      shopifyTheme: raw.shopifyTheme,
      publicSignals: ["cart.js"],
      domainResolution: {
        fetchHost: raw.fetchHost,
        configuredSourceDomain: raw.configuredSourceDomain,
        storeUrlHostname: raw.storeUrlHostname,
        myshopifyHost: raw.myshopifyHost,
        primaryDomainFromResponse: raw.primaryDomainFromResponse,
        domainAliases: raw.domainAliases,
      },
    },
    rawRecordId,
  };

  const confidence: ConfidenceHint = {
    isOfficialApiSource: false,
    fieldCompleteness: ratio,
    hasValidUrls: true,
    missingFields: missing,
    uncertainFields: ["currency"],
  };

  const result: MappingResult = {
    entity: { type: "STORE", data },
    confidence,
    warnings: [],
    enrichmentHints: {
      note: "Optional Phase 2: fetch /, /pages/about, JSON-LD for richer store profile",
      storefrontUrls: [`https://${domain}/`, `https://${domain}/collections/all`],
    },
  };

  return { ok: true, mapping: result };
}

function mapProduct(
  raw: Extract<ShopifyIntelligenceRaw, { _ingestionKind: "PRODUCT" }>,
  rawRecordId: string
): NormalizationOutcome {
  const domain = normalizeShopifyDomain(raw._storeDomain ?? "");
  const handle = typeof raw.handle === "string" ? raw.handle.trim() : "";
  if (!domain || !handle) {
    return {
      ok: false,
      failure: {
        externalId: handle,
        reason: "Product missing store domain or handle",
        rawPayloadSnapshot: raw,
      },
    };
  }

  const url = buildShopifyProductUrl(domain, handle);
  const canonicalUrl = normalizeUrl(url) ?? url;

  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  const prices = variants
    .map((v) => {
      if (!v || v.price === undefined || v.price === null) return NaN;
      if (typeof v.price === "number") return v.price;
      return parseFloat(String(v.price));
    })
    .filter((n) => !isNaN(n));
  const priceMin = prices.length ? Math.min(...prices) : undefined;
  const priceMax = prices.length ? Math.max(...prices) : undefined;
  const isAvailable = variants.some((v) => v && v.available !== false);
  const images = (Array.isArray(raw.images) ? raw.images : [])
    .map((img) => (img && typeof img.src === "string" ? img.src : ""))
    .filter(Boolean);
  const tags = raw.tags
    ? String(raw.tags)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const title = raw.title?.trim() || handle;

  const fieldObj: Record<string, unknown> = {
    handle,
    title,
    vendor: raw.vendor,
    url,
    featuredImage: images[0],
    priceMin,
  };
  const { ratio, missing } = completeness(fieldObj, PRODUCT_TRACKED as unknown as string[]);

  const data = {
    storeDomain: domain,
    externalId: raw.id !== undefined ? String(raw.id) : undefined,
    handle,
    title,
    description: raw.body_html?.replace(/<[^>]+>/g, "").trim(),
    vendor: raw.vendor,
    productType: raw.product_type,
    tags,
    url,
    canonicalUrl,
    featuredImage: images[0],
    images,
    priceMin,
    priceMax,
    currency: undefined,
    isAvailable,
    publishedAt: parseDate(raw.published_at),
    metadata: { fetchedAt: raw._fetchedAt },
    rawRecordId,
    collectionHandles: extractCollectionHandlesFromTags(tags),
  };

  const confidence: ConfidenceHint = {
    isOfficialApiSource: false,
    fieldCompleteness: ratio,
    hasValidUrls: isValidUrl(url),
    missingFields: missing,
    uncertainFields: ["isAvailable", "priceMin"],
  };

  const warnings: string[] = [];
  if (!images.length) warnings.push(`Product ${handle}: no images in public JSON`);

  const result: MappingResult = {
    entity: { type: "PRODUCT", data },
    confidence,
    warnings,
    enrichmentHints: {
      collectionMembership:
        "Not in products.json; derive via collection metafields, /products/{handle}.js, or targeted collection JSON in Phase 2",
    },
  };

  return { ok: true, mapping: result };
}

function mapCollection(
  raw: Extract<ShopifyIntelligenceRaw, { _ingestionKind: "COLLECTION" }>,
  rawRecordId: string
): NormalizationOutcome {
  const domain = normalizeShopifyDomain(raw._storeDomain ?? "");
  const handle = typeof raw.handle === "string" ? raw.handle.trim() : "";
  if (!domain || !handle) {
    return {
      ok: false,
      failure: {
        reason: "Collection missing store domain or handle",
        rawPayloadSnapshot: raw,
      },
    };
  }

  const url = buildShopifyCollectionUrl(domain, handle);
  const canonicalUrl = normalizeUrl(url) ?? url;

  const data = {
    storeDomain: domain,
    externalId: raw.id !== undefined ? String(raw.id) : undefined,
    handle,
    title: raw.title?.trim() || handle,
    description: raw.description,
    url,
    canonicalUrl,
    featuredImage: raw.image?.src,
    productCount: raw.products_count,
    metadata: { fetchedAt: raw._fetchedAt },
    rawRecordId,
  };

  const confidence: ConfidenceHint = {
    isOfficialApiSource: false,
    fieldCompleteness: raw.title && handle ? 0.8 : 0.4,
    hasValidUrls: isValidUrl(url),
    missingFields: [],
    uncertainFields: ["productCount"],
  };

  return {
    ok: true,
    mapping: {
      entity: { type: "COLLECTION", data },
      confidence,
      warnings: [],
      enrichmentHints: {
        note: "Optional Phase 2: /collections/{handle}/products.json for membership edges",
      },
    },
  };
}

/** Heuristic only — many merchants do not tag this way. */
function extractCollectionHandlesFromTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const m = /^collection[:/]/i.exec(t);
    if (m) {
      const rest = t.slice(m[0].length).trim();
      if (rest) out.push(rest);
    }
  }
  return [...new Set(out)];
}
