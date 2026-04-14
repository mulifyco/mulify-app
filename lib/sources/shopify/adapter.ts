/**
 * Shopify public storefront intelligence — paginated, retry-safe cursor over domains/phases.
 */

import type { SourceAdapter, SourceFetchBatchParams } from "@/lib/sources/shared/contracts";
import type {
  AdapterCapabilities,
  AdapterFetchBatchResult,
  AdapterRuntimeConfigBase,
  IngestionContext,
  NormalizationOutcome,
  RawPayloadRecord,
  ShopifySyncCursorV1,
} from "@/lib/sources/shared/types";
import { decodeCursor, encodeCursor } from "@/lib/sources/shared/types";
import { withIngestionRetry } from "@/lib/sources/shared/retry";
import { logger } from "@/lib/logger";
import { normalizeShopifyDomain } from "@/lib/url";
import { resolveShopifyConfig, type ShopifyResolvedConfig } from "./config";
import {
  fetchShopifyCartMeta,
  fetchShopifyProductPageSignals,
  fetchShopifyStorefrontHtmlSignals,
  fetchShopifyCollectionsPage,
  resolveShopifyProductsForSyncBatch,
} from "./public-client";
import { normalizeShopifyRecord } from "./normalizer";
import type { ShopifyIntelligenceRaw } from "./types";

export const SHOPIFY_CAPABILITIES: AdapterCapabilities = {
  supportsPagination: true,
  supportsResume: true,
  supportsIncrementalSync: false,
  maxPageSize: 250,
  rateLimitDescription:
    "Self-throttled client-side; Shopify may still return 429 — ingestion retry handles transient errors.",
  knownLimitations: [
    "No Admin API data (orders, customers, margins).",
    "Merchants can disable products.json / collections.json.",
    "Collection ↔ product edges are not in products.json; require extra fetches or heuristics.",
    "Prices come from variant strings; compare_at_price and tax context omitted.",
  ],
};

function initialPhase(cfg: ShopifyResolvedConfig): ShopifySyncCursorV1["phase"] {
  if (cfg.fetchStoreMeta) return "store_meta";
  if (cfg.fetchProducts) return "products";
  return "collections";
}

function firstCursor(cfg: ShopifyResolvedConfig): ShopifySyncCursorV1 {
  return {
    v: 1,
    domainIndex: 0,
    phase: initialPhase(cfg),
    page: 1,
    productsEmitted: 0,
    collectionsEmitted: 0,
    collectionProductsFanout: undefined,
  };
}

function readCursor(jobCursor: string | undefined, cfg: ShopifyResolvedConfig): ShopifySyncCursorV1 {
  if (!jobCursor) return firstCursor(cfg);
  const decoded = decodeCursor(jobCursor);
  const s = decoded.shopify;
  if (s?.v === 1) {
    return {
      ...s,
      productsEmitted: s.productsEmitted ?? 0,
      collectionsEmitted: s.collectionsEmitted ?? 0,
      collectionProductsFanout: s.collectionProductsFanout ?? undefined,
    };
  }
  return firstCursor(cfg);
}

function writeCursor(c: ShopifySyncCursorV1): string {
  return encodeCursor({ shopify: c });
}

function finishedCursor(cfg: ShopifyResolvedConfig): ShopifySyncCursorV1 {
  return {
    v: 1,
    domainIndex: cfg.domainEntries.length,
    phase: "store_meta",
    page: 1,
    productsEmitted: 0,
    collectionsEmitted: 0,
    collectionProductsFanout: undefined,
  };
}

function nextDomain(cur: ShopifySyncCursorV1, cfg: ShopifyResolvedConfig): ShopifySyncCursorV1 {
  const ni = cur.domainIndex + 1;
  if (ni >= cfg.domainEntries.length) {
    return finishedCursor(cfg);
  }
  return {
    v: 1,
    domainIndex: ni,
    phase: initialPhase(cfg),
    page: 1,
    productsEmitted: 0,
    collectionsEmitted: 0,
    collectionProductsFanout: undefined,
  };
}

function afterStoreMeta(cur: ShopifySyncCursorV1, cfg: ShopifyResolvedConfig): ShopifySyncCursorV1 {
  if (cfg.fetchProducts) {
    return { ...cur, phase: "products", page: 1, productsEmitted: 0, collectionProductsFanout: undefined };
  }
  if (cfg.fetchCollections) {
    return { ...cur, phase: "collections", page: 1, collectionsEmitted: 0 };
  }
  return nextDomain(cur, cfg);
}

function afterProductsExhausted(cur: ShopifySyncCursorV1, cfg: ShopifyResolvedConfig): ShopifySyncCursorV1 {
  if (cfg.fetchCollections) {
    return {
      ...cur,
      phase: "collections",
      page: 1,
      collectionsEmitted: 0,
      collectionProductsFanout: undefined,
    };
  }
  return nextDomain(cur, cfg);
}

function afterCollectionsExhausted(cur: ShopifySyncCursorV1, cfg: ShopifyResolvedConfig): ShopifySyncCursorV1 {
  return nextDomain(cur, cfg);
}

export class ShopifyStorefrontSourceAdapter
  implements SourceAdapter<ShopifyResolvedConfig, ShopifyIntelligenceRaw>
{
  readonly capabilities = SHOPIFY_CAPABILITIES;

  resolveConfig(base: AdapterRuntimeConfigBase): ShopifyResolvedConfig {
    return resolveShopifyConfig(base);
  }

  async fetchBatch(
    params: SourceFetchBatchParams,
    config: ShopifyResolvedConfig
  ): Promise<AdapterFetchBatchResult<ShopifyIntelligenceRaw>> {
    const cur = readCursor(params.jobCursor, config);

    if (cur.domainIndex >= config.domainEntries.length) {
      return { records: [], hasMore: false, totalFetched: 0 };
    }

    const entry = config.domainEntries[cur.domainIndex];
    const fetchHost = entry.fetchHost;
    const canonicalDomain = entry.canonicalDomain;
    const fetchedAt = new Date().toISOString();
    const records: RawPayloadRecord<ShopifyIntelligenceRaw>[] = [];
    const mockOpt = { mock: Boolean(config.mockMode) };

    if (cur.phase === "store_meta") {
      await config.rateLimiter.throttle();
      const meta = await withIngestionRetry(
        () => fetchShopifyCartMeta(fetchHost, mockOpt),
        { label: `shopify-cart.js:${fetchHost}` }
      );
      const htmlSignals = await withIngestionRetry(
        () => fetchShopifyStorefrontHtmlSignals(fetchHost, mockOpt),
        { label: `shopify-html:${fetchHost}` }
      ).catch(() => null);
      const primaryFromResponse = meta?.permanent_domain
        ? normalizeShopifyDomain(meta.permanent_domain)
        : meta?.shop
          ? normalizeShopifyDomain(meta.shop)
          : undefined;
      const domainAliases = [...entry.aliases, canonicalDomain, fetchHost].filter(
        (h, i, a) => a.indexOf(h) === i
      );
      if (entry.myshopifyHost && !domainAliases.includes(entry.myshopifyHost)) {
        domainAliases.push(entry.myshopifyHost);
      }
      const payload: ShopifyIntelligenceRaw = {
        _ingestionKind: "STORE",
        domain: canonicalDomain,
        fetchHost,
        configuredSourceDomain: entry.configuredSourceDomain,
        storeUrlHostname: entry.storeUrlHostname,
        myshopifyHost: entry.myshopifyHost,
        primaryDomainFromResponse: primaryFromResponse,
        domainAliases,
        currency: meta?.currency,
        _htmlSignals: htmlSignals
          ? {
              collectionsFromHtml: htmlSignals.collections.length,
              productsFromHtml: htmlSignals.products.length,
              nextDataPresent: htmlSignals.nextDataPresent,
              jsonLdBlocks: htmlSignals.jsonLdBlocks,
            }
          : undefined,
        _fetchedAt: fetchedAt,
      };
      logger.info("shopify.adapter.store_meta", {
        sourceId: params.ctx.sourceId,
        jobId: params.ctx.jobId,
        fetchHost,
        canonicalDomain,
        configuredSourceDomain: entry.configuredSourceDomain,
        storeUrlHostname: entry.storeUrlHostname,
        myshopifyHost: entry.myshopifyHost,
        primaryFromResponse,
        currency: meta?.currency,
      });
      records.push({
        externalId: canonicalDomain,
        entityType: "STORE",
        payload,
        ingestionTimestamp: fetchedAt,
        sourceMetadata: { fetchHost, canonicalDomain, phase: "store_meta" },
      });
      const next = afterStoreMeta(cur, config);
      const done = next.domainIndex >= config.domainEntries.length;
      return {
        records,
        nextCursor: done ? undefined : writeCursor(next),
        hasMore: !done,
        totalFetched: records.length,
      };
    }

    if (cur.phase === "products") {
      await config.rateLimiter.throttle();
      const batch = await withIngestionRetry(
        () =>
          resolveShopifyProductsForSyncBatch(fetchHost, {
            primaryPage: cur.page,
            pageSize: config.pageSize,
            mock: config.mockMode,
            fanout: cur.collectionProductsFanout ?? null,
          }),
        { label: `shopify-products:${fetchHost}:p${cur.page}` }
      );

      let emitted = cur.productsEmitted ?? 0;
      const items = batch.items;

      logger.info("shopify.adapter.products_fetched", {
        sourceId: params.ctx.sourceId,
        jobId: params.ctx.jobId,
        fetchHost,
        canonicalDomain,
        source: batch.source,
        rawCount: items.length,
        nextFanout: Boolean(batch.nextFanout),
      });

      if (!items.length && !batch.nextFanout) {
        const next = afterProductsExhausted(cur, config);
        const done = next.domainIndex >= config.domainEntries.length;
        return {
          records,
          nextCursor: done ? undefined : writeCursor(next),
          hasMore: !done,
          totalFetched: 0,
        };
      }

      let parseFailures = 0;
      let enrichedThisBatch = 0;
      for (const p of items) {
        if (emitted >= config.maxProductsPerStore) break;
        if (!p?.handle) {
          parseFailures++;
          continue;
        }
        // Product page enrichment is expensive; keep it capped per batch.
        const signals =
          enrichedThisBatch < 2
            ? await fetchShopifyProductPageSignals(fetchHost, p.handle, mockOpt).catch(() => null)
            : null;
        if (signals) enrichedThisBatch++;
        const payload: ShopifyIntelligenceRaw = {
          ...p,
          _ingestionKind: "PRODUCT",
          _storeDomain: canonicalDomain,
          _fetchedAt: fetchedAt,
          _offerSignals: signals?.offerSignals,
          _htmlSignals: signals?.htmlSignals,
        };
        records.push({
          externalId: `${canonicalDomain}__${p.handle}`,
          entityType: "PRODUCT",
          payload,
          ingestionTimestamp: fetchedAt,
          sourceMetadata: { fetchHost, canonicalDomain, phase: "products", page: cur.page },
        });
        emitted++;
      }

      if (parseFailures > 0) {
        logger.warn("shopify.adapter.product_batch_skipped", {
          fetchHost,
          parseFailures,
        });
      }

      let next: ShopifySyncCursorV1;
      if (emitted >= config.maxProductsPerStore) {
        next = afterProductsExhausted({ ...cur, productsEmitted: emitted }, config);
      } else if (batch.nextFanout) {
        next = {
          ...cur,
          productsEmitted: emitted,
          collectionProductsFanout: batch.nextFanout,
        };
      } else if (batch.source === "primary_json" && items.length === config.pageSize) {
        next = {
          ...cur,
          page: cur.page + 1,
          productsEmitted: emitted,
          collectionProductsFanout: undefined,
        };
      } else {
        next = afterProductsExhausted({ ...cur, productsEmitted: emitted }, config);
      }

      const done = next.domainIndex >= config.domainEntries.length;
      return {
        records,
        nextCursor: done ? undefined : writeCursor(next),
        hasMore: !done,
        totalFetched: records.length,
      };
    }

    // collections
    await config.rateLimiter.throttle();
    const cols = await withIngestionRetry(
      () => fetchShopifyCollectionsPage(fetchHost, cur.page, config.pageSize, mockOpt),
      { label: `shopify-collections:${fetchHost}:p${cur.page}` }
    );

    let cEmit = cur.collectionsEmitted ?? 0;

    logger.info("shopify.adapter.collections_fetched", {
      sourceId: params.ctx.sourceId,
      fetchHost,
      canonicalDomain,
      page: cur.page,
      count: cols.length,
    });

    if (!cols.length) {
      const next = afterCollectionsExhausted(cur, config);
      const done = next.domainIndex >= config.domainEntries.length;
      return {
        records,
        nextCursor: done ? undefined : writeCursor(next),
        hasMore: !done,
        totalFetched: 0,
      };
    }

    for (const c of cols) {
      if (cEmit >= config.maxCollectionsPerStore) break;
      if (!c?.handle) {
        logger.warn("shopify.adapter.collection_skip_no_handle", { fetchHost });
        continue;
      }
      const payload: ShopifyIntelligenceRaw = {
        ...c,
        _ingestionKind: "COLLECTION",
        _storeDomain: canonicalDomain,
        _fetchedAt: fetchedAt,
      };
      records.push({
        externalId: `${canonicalDomain}__collection__${c.handle}`,
        entityType: "COLLECTION",
        payload,
        ingestionTimestamp: fetchedAt,
        sourceMetadata: { fetchHost, canonicalDomain, phase: "collections", page: cur.page },
      });
      cEmit++;
    }

    let next: ShopifySyncCursorV1;
    if (cEmit >= config.maxCollectionsPerStore) {
      next = afterCollectionsExhausted({ ...cur, collectionsEmitted: cEmit }, config);
    } else if (cols.length === config.pageSize) {
      next = { ...cur, page: cur.page + 1, collectionsEmitted: cEmit };
    } else {
      next = afterCollectionsExhausted({ ...cur, collectionsEmitted: cEmit }, config);
    }

    const done = next.domainIndex >= config.domainEntries.length;
    return {
      records,
      nextCursor: done ? undefined : writeCursor(next),
      hasMore: !done,
      totalFetched: records.length,
    };
  }

  normalize(
    _ctx: IngestionContext,
    record: RawPayloadRecord<ShopifyIntelligenceRaw>,
    rawRecordId: string
  ): NormalizationOutcome {
    return normalizeShopifyRecord(record, rawRecordId);
  }
}
