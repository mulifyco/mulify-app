import prisma from "@/lib/prisma";
import type { Prisma, TrafficTrend } from "@prisma/client";
import { normalizeUrl } from "@/lib/url";

export const TRAFFIC_BREAKDOWN_VERSION = 1 as const;

export type TrafficReasonCode =
  | "ADS_LINKED_TO_STORE"
  | "REPEATED_AD_DESTINATIONS"
  | "LANDING_PAGE_COVERAGE"
  | "CATALOG_DEPTH"
  | "RECENT_SYNC_ACTIVITY"
  | "DOMAIN_CONFIRMATION_STRONG"
  | "RISING_DOMAIN_SIGNAL"
  | "MULTI_AD_STORE_SIGNAL"
  | "STALE_STORE_PENALTY"
  | "ORPHAN_TRAFFIC_GRAPH"
  | "STALE_STORE_SIGNAL"
  | "ADS_TO_PDP"
  | "PRODUCT_LP_LINKS"
  | "URL_LINEAGE_REPEATED"
  | "PRODUCT_FRESH"
  | "SYNC_CONFIRMATIONS"
  | "COLLECTION_DEPTH"
  | "PRODUCT_STALE_PENALTY"
  | "WEAK_STORE_TRAFFIC";

export interface TrafficBreakdownBase {
  version: typeof TRAFFIC_BREAKDOWN_VERSION;
  entity: "STORE" | "PRODUCT";
  previousScore: number | null;
  trendBasis: "score_delta" | "initial";
  inputs: Record<string, number>;
  weighted: Record<string, number> & { _sum?: number };
  penalties: Record<string, number>;
  computedAt: string;
}

const STORE_W = {
  linkedAds: 0.22,
  repeatedDestinations: 0.14,
  landingPages: 0.14,
  catalogDepth: 0.12,
  recentSync: 0.1,
  domainConfirm: 0.1,
  risingDomain: 0.09,
  multiAdSignal: 0.09,
} as const;

const PRODUCT_W = {
  adsToPdp: 0.28,
  productLpLinks: 0.14,
  urlLineage: 0.12,
  freshness: 0.12,
  syncConfirm: 0.12,
  collectionDepth: 0.12,
  storeTrafficBoost: 0.1,
} as const;

function clamp100(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asIdArray(raw: Prisma.JsonValue): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function signalTouchesStoreId(
  type: string,
  relatedIds: string[],
  storeId: string
): boolean {
  if (relatedIds.includes(storeId)) return true;
  if (type === "multi_ad_same_store" && relatedIds.includes(storeId)) return true;
  if (type === "stale_store" && relatedIds.includes(storeId)) return true;
  if (type === "high_product_growth" && relatedIds.includes(storeId)) return true;
  return false;
}

function trendFromDelta(prev: number | null, next: number): TrafficTrend {
  if (prev == null) return "STABLE";
  if (next >= prev + 5) return "RISING";
  if (next <= prev - 5) return "FALLING";
  return "STABLE";
}

export async function loadRelevantSignalsForTraffic() {
  return prisma.intelligenceSignal.findMany({
    where: {
      active: true,
      type: {
        in: [
          "repeated_ad_destination",
          "multi_ad_same_store",
          "stale_store",
          "rising_domain_activity",
          "high_product_growth",
        ],
      },
    },
    select: { type: true, relatedEntityIds: true, evidence: true },
    take: 2500,
  });
}

type TrafficSignalRow = Awaited<ReturnType<typeof loadRelevantSignalsForTraffic>>[number];

export async function recomputeStoreTraffic(
  storeId: string,
  options: { signals?: TrafficSignalRow[] } = {}
): Promise<{
  score: number;
  trend: TrafficTrend;
  breakdown: TrafficBreakdownBase;
  reasonCodes: TrafficReasonCode[];
}> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { _count: { select: { products: true, collections: true } } },
  });
  if (!store) {
    throw new Error(`Store not found: ${storeId}`);
  }

  const prevScore = store.trafficScore ?? null;

  const adInfer = await prisma.inferredLink.findMany({
    where: {
      toEntityType: "STORE",
      toEntityId: storeId,
      fromEntityType: "AD",
    },
    select: { fromEntityId: true },
  });
  const linkedAdIds = [...new Set(adInfer.map((r) => r.fromEntityId))];
  const linkedAdCount = linkedAdIds.length;

  let repeatedDestinationHits = 0;
  if (linkedAdIds.length) {
    const ads = await prisma.ad.findMany({
      where: { id: { in: linkedAdIds } },
      select: { canonicalUrl: true },
    });
    const urls = [...new Set(ads.map((a) => a.canonicalUrl).filter(Boolean))] as string[];
    if (urls.length) {
      const groups = await prisma.ad.groupBy({
        by: ["canonicalUrl"],
        where: { canonicalUrl: { in: urls } },
        _count: { _all: true },
      });
      repeatedDestinationHits = groups.filter((g) => g.canonicalUrl && g._count._all > 1).length;
    }
  }

  const lpIdsEntityGrouped = await prisma.entityLink.groupBy({
    by: ["landingPageId"],
    where: { storeId, landingPageId: { not: null } },
  });
  const lpIdsInfer = await prisma.inferredLink.findMany({
    where: {
      toEntityType: "STORE",
      toEntityId: storeId,
      fromEntityType: "LANDING_PAGE",
    },
    select: { fromEntityId: true },
  });
  const lpIdSet = new Set<string>();
  for (const r of lpIdsEntityGrouped) {
    if (r.landingPageId) lpIdSet.add(r.landingPageId);
  }
  for (const r of lpIdsInfer) lpIdSet.add(r.fromEntityId);
  const landingPageCount = lpIdSet.size;

  const productCount = store._count.products;

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
  const recentSyncActivity = await prisma.ingestionJob.count({
    where: { status: "COMPLETED", completedAt: { gte: fourteenDaysAgo } },
  });

  const lpToStoreStrengths = await prisma.inferredLink.findMany({
    where: {
      toEntityType: "STORE",
      toEntityId: storeId,
      fromEntityType: "LANDING_PAGE",
    },
    select: { strength: true },
  });
  const domainConfirmAvg =
    lpToStoreStrengths.length === 0
      ? 0
      : lpToStoreStrengths.reduce((a, b) => a + b.strength, 0) / lpToStoreStrengths.length;

  const signals = options.signals ?? (await loadRelevantSignalsForTraffic());
  let risingDomainHit = 0;
  let multiAdStoreHit = 0;
  let staleStoreSignalHit = 0;
  let repeatedDestSignalForStore = 0;

  for (const s of signals) {
    const ids = asIdArray(s.relatedEntityIds as Prisma.JsonValue);
    if (s.type === "rising_domain_activity" && ids.includes(store.domain)) {
      risingDomainHit = 1;
    }
    if (signalTouchesStoreId(s.type, ids, storeId)) {
      if (s.type === "multi_ad_same_store") multiAdStoreHit = 1;
      if (s.type === "stale_store") staleStoreSignalHit = 1;
    }
    if (s.type === "repeated_ad_destination") {
      const overlap = ids.some((adId) => linkedAdIds.includes(adId));
      if (overlap) repeatedDestSignalForStore = 1;
    }
  }

  const weighted = {
    linkedAds: STORE_W.linkedAds * Math.min(1, linkedAdCount / 14),
    repeatedDestinations:
      STORE_W.repeatedDestinations *
      Math.min(1, (repeatedDestinationHits + repeatedDestSignalForStore * 2) / 10),
    landingPages: STORE_W.landingPages * Math.min(1, landingPageCount / 12),
    catalogDepth: STORE_W.catalogDepth * Math.min(1, Math.log10(productCount + 1) / 3),
    recentSync: STORE_W.recentSync * Math.min(1, recentSyncActivity / 18),
    domainConfirm: STORE_W.domainConfirm * Math.min(1, domainConfirmAvg * 1.15),
    risingDomain: STORE_W.risingDomain * risingDomainHit,
    multiAdSignal: STORE_W.multiAdSignal * multiAdStoreHit,
  };

  const staleDays = (Date.now() - store.lastSeenAt.getTime()) / 86400000;
  const stalePenalty = staleDays > 45 ? Math.min(22, (staleDays - 45) * 0.35) : 0;
  const orphanPenalty =
    linkedAdCount === 0 && landingPageCount === 0 && productCount > 0 ? 14 : linkedAdCount === 0 && landingPageCount === 0 && productCount === 0 ? 8 : 0;
  const signalStalePenalty = staleStoreSignalHit ? 10 : 0;

  const penalties = {
    stale: stalePenalty,
    orphan: orphanPenalty,
    staleSignal: signalStalePenalty,
  };

  const sumWeighted = Object.values(weighted).reduce((a, b) => a + b, 0);
  const sumPenalties = Object.values(penalties).reduce((a, b) => a + b, 0);
  const score = clamp100(sumWeighted * 100 - sumPenalties);

  const trend = trendFromDelta(prevScore, score);
  const trendBasis: TrafficBreakdownBase["trendBasis"] = prevScore == null ? "initial" : "score_delta";

  const reasonCodes: TrafficReasonCode[] = [];
  if (linkedAdCount > 0) reasonCodes.push("ADS_LINKED_TO_STORE");
  if (repeatedDestinationHits > 0 || repeatedDestSignalForStore) reasonCodes.push("REPEATED_AD_DESTINATIONS");
  if (landingPageCount > 0) reasonCodes.push("LANDING_PAGE_COVERAGE");
  if (productCount >= 10) reasonCodes.push("CATALOG_DEPTH");
  if (recentSyncActivity > 0) reasonCodes.push("RECENT_SYNC_ACTIVITY");
  if (domainConfirmAvg >= 0.75) reasonCodes.push("DOMAIN_CONFIRMATION_STRONG");
  if (risingDomainHit) reasonCodes.push("RISING_DOMAIN_SIGNAL");
  if (multiAdStoreHit) reasonCodes.push("MULTI_AD_STORE_SIGNAL");
  if (stalePenalty > 0) reasonCodes.push("STALE_STORE_PENALTY");
  if (orphanPenalty > 0) reasonCodes.push("ORPHAN_TRAFFIC_GRAPH");
  if (staleStoreSignalHit) reasonCodes.push("STALE_STORE_SIGNAL");

  const breakdown: TrafficBreakdownBase = {
    version: TRAFFIC_BREAKDOWN_VERSION,
    entity: "STORE",
    previousScore: prevScore,
    trendBasis,
    inputs: {
      linkedAdCount,
      repeatedDestinationHits,
      repeatedDestSignalForStore,
      landingPageCount,
      productCount,
      recentSyncActivity,
      domainConfirmAvg,
      risingDomainHit,
      multiAdStoreHit,
      staleStoreSignalHit,
      staleDays,
    },
    weighted: { ...weighted, _sum: sumWeighted },
    penalties,
    computedAt: new Date().toISOString(),
  };

  await prisma.store.update({
    where: { id: storeId },
    data: {
      trafficScore: score,
      trafficTrend: trend,
      trafficBreakdown: breakdown as object as Prisma.InputJsonValue,
      trafficUpdatedAt: new Date(),
      trafficReasonCodes: reasonCodes,
    },
  });

  return { score, trend, breakdown, reasonCodes };
}

export async function recomputeProductTraffic(productId: string): Promise<{
  score: number;
  trend: TrafficTrend;
  breakdown: TrafficBreakdownBase;
  reasonCodes: TrafficReasonCode[];
}> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      store: true,
      collectionMemberships: { select: { productId: true, collectionId: true } },
      confidenceScores: { take: 1 },
      entityLinks: { where: { entityType: "LANDING_PAGE" } },
    },
  });
  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  const prevScore = product.trafficScore ?? null;

  const normCanon = normalizeUrl(product.canonicalUrl) ?? product.canonicalUrl;
  const pathHint = `/products/${product.handle}`;

  const lps = await prisma.landingPage.findMany({
    where: {
      OR: [
        { url: normCanon },
        {
          domain: product.store.domain,
          path: { contains: pathHint },
        },
      ],
    },
    select: { id: true },
    take: 40,
  });
  const lpIds = lps.map((l) => l.id);

  let adsToPdp = 0;
  if (lpIds.length) {
    const fromJoin = await prisma.ad.findMany({
      where: { landingPages: { some: { id: { in: lpIds } } } },
      select: { id: true },
    });
    const infer = await prisma.inferredLink.findMany({
      where: {
        toEntityType: "LANDING_PAGE",
        toEntityId: { in: lpIds },
        fromEntityType: "AD",
      },
      select: { fromEntityId: true },
    });
    const adSet = new Set<string>();
    for (const a of fromJoin) adSet.add(a.id);
    for (const r of infer) adSet.add(r.fromEntityId);
    adsToPdp = adSet.size;
  }

  const productLpLinks = product.entityLinks.length;

  const lineageCount = await prisma.entityLink.count({
    where: {
      OR: [{ entityType: "PRODUCT", entityId: productId }, { productId }],
    },
  });

  const daysSinceSeen = (Date.now() - product.lastSeenAt.getTime()) / 86400000;
  const freshness = daysSinceSeen <= 14 ? 1 : daysSinceSeen <= 45 ? 0.55 : 0.2;

  const syncCount = product.confidenceScores[0]?.syncCount ?? 1;
  const syncConfirm = Math.min(1, 0.35 + (syncCount - 1) * 0.12);

  const collectionCount = product.collectionMemberships.length;
  const collectionDepth = Math.min(1, collectionCount / 6);

  const storeTraffic = product.store.trafficScore;
  const storeBoost =
    storeTraffic != null ? Math.min(1, storeTraffic / 100) * 0.85 : 0.35;

  const weighted = {
    adsToPdp: PRODUCT_W.adsToPdp * Math.min(1, adsToPdp / 10),
    productLpLinks: PRODUCT_W.productLpLinks * Math.min(1, productLpLinks / 4),
    urlLineage: PRODUCT_W.urlLineage * Math.min(1, lineageCount / 8),
    freshness: PRODUCT_W.freshness * freshness,
    syncConfirm: PRODUCT_W.syncConfirm * syncConfirm,
    collectionDepth: PRODUCT_W.collectionDepth * collectionDepth,
    storeTrafficBoost: PRODUCT_W.storeTrafficBoost * storeBoost,
  };

  let weakStorePenalty = 0;
  if (storeTraffic == null || storeTraffic < 22) {
    weakStorePenalty = 12;
  }

  const staleProductPenalty = daysSinceSeen > 60 ? Math.min(18, (daysSinceSeen - 60) * 0.25) : 0;

  const penalties = {
    weakStore: weakStorePenalty,
    staleProduct: staleProductPenalty,
  };
  const sumWeighted = Object.values(weighted).reduce((a, b) => a + b, 0);
  const sumPenalties = Object.values(penalties).reduce((a, b) => a + b, 0);
  const score = clamp100(sumWeighted * 100 - sumPenalties);

  const trend = trendFromDelta(prevScore, score);
  const trendBasis: TrafficBreakdownBase["trendBasis"] = prevScore == null ? "initial" : "score_delta";

  const reasonCodes: TrafficReasonCode[] = [];
  if (adsToPdp > 0) reasonCodes.push("ADS_TO_PDP");
  if (productLpLinks > 0) reasonCodes.push("PRODUCT_LP_LINKS");
  if (lineageCount >= 2) reasonCodes.push("URL_LINEAGE_REPEATED");
  if (freshness >= 0.9) reasonCodes.push("PRODUCT_FRESH");
  if (syncCount >= 2) reasonCodes.push("SYNC_CONFIRMATIONS");
  if (collectionCount > 0) reasonCodes.push("COLLECTION_DEPTH");
  if (weakStorePenalty > 0) reasonCodes.push("WEAK_STORE_TRAFFIC");
  if (staleProductPenalty > 0) reasonCodes.push("PRODUCT_STALE_PENALTY");

  const breakdown: TrafficBreakdownBase = {
    version: TRAFFIC_BREAKDOWN_VERSION,
    entity: "PRODUCT",
    previousScore: prevScore,
    trendBasis,
    inputs: {
      adsToPdp,
      productLpLinks,
      lineageCount,
      daysSinceSeen,
      syncCount,
      collectionCount,
      storeTraffic: storeTraffic ?? -1,
      landingPagesMatched: lpIds.length,
    },
    weighted: { ...weighted, _sum: sumWeighted },
    penalties,
    computedAt: new Date().toISOString(),
  };

  await prisma.product.update({
    where: { id: productId },
    data: {
      trafficScore: score,
      trafficTrend: trend,
      trafficBreakdown: breakdown as object as Prisma.InputJsonValue,
      trafficUpdatedAt: new Date(),
      trafficReasonCodes: reasonCodes,
    },
  });

  return { score, trend, breakdown, reasonCodes };
}

export async function batchRecomputeTrafficScores(options: {
  storeLimit?: number;
  productLimit?: number;
} = {}): Promise<{ stores: number; products: number; errors: string[] }> {
  const storeLimit = options.storeLimit ?? 600;
  const productLimit = options.productLimit ?? 800;
  const errors: string[] = [];
  let stores = 0;
  let products = 0;

  const signals = await loadRelevantSignalsForTraffic();
  const storeRows = await prisma.store.findMany({
    select: { id: true },
    orderBy: { lastSeenAt: "desc" },
    take: storeLimit,
  });
  for (const s of storeRows) {
    try {
      await recomputeStoreTraffic(s.id, { signals });
      stores++;
    } catch (e) {
      errors.push(`store ${s.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const productRows = await prisma.product.findMany({
    select: { id: true },
    orderBy: { lastSeenAt: "desc" },
    take: productLimit,
  });
  for (const p of productRows) {
    try {
      await recomputeProductTraffic(p.id);
      products++;
    } catch (e) {
      errors.push(`product ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { stores, products, errors };
}
