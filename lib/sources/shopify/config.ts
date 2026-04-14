import { z } from "zod";
import type { AdapterRuntimeConfigBase } from "@/lib/sources/shared/types";
import { getShopifyConfig, shouldMockAllSourceApis } from "@/config";
import { RateLimiter } from "@/lib/http";
import { logger } from "@/lib/logger";
import { normalizeShopifyDomain } from "@/lib/url";
import {
  buildShopifyDomainEntries,
  describeDomainResolution,
  hostnamesFromSourceJson,
  isPlaceholderShopifyDomain,
  mergeEnvShopifyDomains,
  type ShopifyDomainEntry,
} from "./domains";

function withSourceContext(
  entries: ShopifyDomainEntry[],
  configuredSourceDomain: string | undefined,
  storeUrlHostname: string | undefined
): ShopifyDomainEntry[] {
  return entries.map((e) => ({
    ...e,
    ...(configuredSourceDomain ? { configuredSourceDomain } : {}),
    ...(storeUrlHostname ? { storeUrlHostname } : {}),
  }));
}

const sourceJsonSchema = z.object({
  /** Highest-priority canonical domain (hostname only or URL). */
  sourceDomain: z.string().min(1).optional(),
  /** Storefront base URL; hostname is extracted after sourceDomain. */
  storeUrl: z.string().min(1).optional(),
  /** May be empty when storeUrl / sourceDomain or env supplies domains. */
  targetDomains: z.array(z.string().min(1)).default([]),
  fetchProducts: z.boolean().optional(),
  fetchCollections: z.boolean().optional(),
  fetchStoreMeta: z.boolean().optional(),
  maxProductsPerStore: z.number().int().positive().max(10_000).optional(),
  maxCollectionsPerStore: z.number().int().positive().max(10_000).optional(),
  /** Page size for products.json / collections.json (Shopify max 250). */
  pageSize: z.number().int().positive().max(250).optional(),
});

export type ShopifySourceConfigJson = z.infer<typeof sourceJsonSchema>;

function isOfflineFixtureDomainList(entries: ShopifyDomainEntry[]): boolean {
  if (!entries.length) return false;
  return entries.every(
    (e) =>
      e.fetchHost.endsWith(".local") ||
      e.fetchHost.endsWith(".test") ||
      e.canonicalDomain.endsWith(".local") ||
      e.canonicalDomain.endsWith(".test")
  );
}

export interface ShopifyResolvedConfig {
  domainEntries: ShopifyDomainEntry[];
  /** Fetch hosts in cursor order (same as domainEntries[].fetchHost). */
  domains: string[];
  fetchProducts: boolean;
  fetchCollections: boolean;
  fetchStoreMeta: boolean;
  maxProductsPerStore: number;
  maxCollectionsPerStore: number;
  pageSize: number;
  rateLimiter: RateLimiter;
  mockMode?: boolean;
}

export function resolveShopifyConfig(base: AdapterRuntimeConfigBase): ShopifyResolvedConfig {
  const env = getShopifyConfig();

  const parsed = sourceJsonSchema.safeParse(base.sourceConfigJson);
  if (!parsed.success) {
    throw new Error(`Invalid Shopify source config JSON: ${parsed.error.message}`);
  }

  const j = parsed.data;
  const fromJson = hostnamesFromSourceJson({
    sourceDomain: j.sourceDomain,
    storeUrl: j.storeUrl,
    targetDomains: j.targetDomains,
  });
  const merged = mergeEnvShopifyDomains(fromJson, env.targetDomains);
  const configuredSourceDomain = j.sourceDomain?.trim()
    ? normalizeShopifyDomain(j.sourceDomain.trim())
    : undefined;
  const storeUrlHostname = j.storeUrl?.trim()
    ? normalizeShopifyDomain(
        j.storeUrl.trim().includes("://") ? j.storeUrl.trim() : `https://${j.storeUrl.trim()}`
      )
    : undefined;
  let domainEntries = withSourceContext(
    buildShopifyDomainEntries(merged),
    configuredSourceDomain,
    storeUrlHostname
  );

  const mockFromFlag = shouldMockAllSourceApis();
  if (!domainEntries.length && mockFromFlag) {
    domainEntries = withSourceContext(
      buildShopifyDomainEntries(["library-mock-store.local"]),
      configuredSourceDomain,
      storeUrlHostname
    );
  }

  const placeholdersOnly =
    merged.length > 0 &&
    merged.every((h) => isPlaceholderShopifyDomain(h)) &&
    !mockFromFlag;

  if (placeholdersOnly) {
    throw new Error(
      "Shopify source config: replace example.myshopify.com with your real storefront hostname, " +
        "or set sourceDomain / storeUrl / targetDomains to a live domain (or SHOPIFY_TARGET_DOMAINS)."
    );
  }

  if (!domainEntries.length) {
    throw new Error(
      "Shopify adapter requires sourceDomain, storeUrl, targetDomains in source config and/or SHOPIFY_TARGET_DOMAINS env, " +
        "or set LIBRARY_MOCK_SOURCE_APIS=true for offline fixtures."
    );
  }

  const mockMode =
    // Safety: fixtures allowed only outside production.
    (process.env.NODE_ENV !== "production" && (mockFromFlag || isOfflineFixtureDomainList(domainEntries)));

  const fetchStoreMeta = j.fetchStoreMeta !== false;
  const fetchProducts = j.fetchProducts !== false;
  const fetchCollections = j.fetchCollections !== false;
  if (!fetchStoreMeta && !fetchProducts && !fetchCollections) {
    throw new Error(
      "Shopify source config: enable at least one of fetchStoreMeta, fetchProducts, fetchCollections."
    );
  }

  const domains = domainEntries.map((e) => e.fetchHost);

  logger.info("shopify.resolve_config.domains", {
    sourceId: base.sourceId,
    sourceName: base.sourceName ?? undefined,
    configuredSourceDomain: j.sourceDomain ?? undefined,
    storeUrl: j.storeUrl ?? undefined,
    targetDomains: j.targetDomains,
    envDomainCount: env.targetDomains.length,
    mergedHostnames: merged,
    resolved: describeDomainResolution(domainEntries),
    domainEntries: domainEntries.map((e) => ({
      fetchHost: e.fetchHost,
      canonicalDomain: e.canonicalDomain,
      myshopifyHost: e.myshopifyHost,
      aliases: e.aliases,
      note: e.resolutionNote,
    })),
    mockMode,
  });

  return {
    domainEntries,
    domains,
    fetchProducts,
    fetchCollections,
    fetchStoreMeta,
    maxProductsPerStore: j.maxProductsPerStore ?? 250,
    maxCollectionsPerStore: j.maxCollectionsPerStore ?? 100,
    pageSize: Math.min(j.pageSize ?? 250, 250),
    rateLimiter: new RateLimiter(env.requestsPerMinute, 60_000),
    mockMode,
  };
}
