import prisma from "@/lib/prisma";
import type { OpportunityLevel, Prisma } from "@prisma/client";
import { normalizeUrl } from "@/lib/url";

export const FUSION_BREAKDOWN_VERSION = 1 as const;

export type FusionReasonCode =
  | "META_AD_REPETITION"
  | "LONG_ACTIVE_RUN"
  | "LINKED_STORE_TRAFFIC"
  | "LINKED_PRODUCT_TRAFFIC"
  | "PRODUCT_PROMINENCE"
  | "LANDING_CONFIRMATIONS"
  | "STORE_FRESH"
  | "COLLECTION_DEPTH"
  | "CONFIDENCE_V2_BONUS"
  | "AD_MERGE_CONFLICT"
  | "STALE_AD_PENALTY"
  | "BROKEN_LANDING_SIGNAL"
  | "DUPLICATE_PRODUCT_LINK_PENALTY"
  | "MULTI_AD_STORE_PRESSURE"
  | "CATALOG_PROMINENCE_BLEND"
  | "STORE_MERGE_RISK"
  | "STALE_STORE_PENALTY"
  | "PDP_AD_PRESSURE"
  | "STORE_TRAFFIC_BLEND"
  | "DUPLICATE_CLUSTER_PENALTY"
  | "STALE_PRODUCT_PENALTY";

export interface FusionBreakdown {
  version: typeof FUSION_BREAKDOWN_VERSION;
  entity: "AD" | "STORE" | "PRODUCT";
  inputs: Record<string, unknown>;
  weighted: Record<string, number> & { _sum?: number };
  penalties: Record<string, number>;
  opportunitySignals: string[];
  breakoutHints: string[];
  computedAt: string;
}

function clamp100(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function opportunityLevelFromScore(score: number): OpportunityLevel {
  if (score >= 78) return "BREAKOUT";
  if (score >= 58) return "STRONG";
  if (score >= 38) return "WATCH";
  return "WEAK";
}

function asIdArray(raw: Prisma.JsonValue): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function confidenceV2Norm(
  row:
    | { breakdownV2: Prisma.JsonValue | null; overallScore: number }
    | undefined
    | null
): number {
  if (!row) return 0.42;
  const b = row.breakdownV2;
  if (b && typeof b === "object" && b !== null && "normalizedOverall" in b) {
    const n = (b as { normalizedOverall: unknown }).normalizedOverall;
    if (typeof n === "number" && !Number.isNaN(n)) return Math.min(1, Math.max(0, n));
  }
  return Math.min(1, Math.max(0, row.overallScore));
}

export async function loadFusionSignals() {
  return prisma.intelligenceSignal.findMany({
    where: {
      active: true,
      type: {
        in: [
          "repeated_ad_destination",
          "broken_landing_reference",
          "duplicate_product_cluster",
          "multi_ad_same_store",
          "stale_store",
        ],
      },
    },
    select: { type: true, relatedEntityIds: true },
    take: 2500,
  });
}

type FusionSignalRow = Awaited<ReturnType<typeof loadFusionSignals>>[number];

function signalIncludesId(signals: FusionSignalRow[], type: string, id: string): boolean {
  for (const s of signals) {
    if (s.type !== type) continue;
    if (asIdArray(s.relatedEntityIds as Prisma.JsonValue).includes(id)) return true;
  }
  return false;
}

async function adsTouchingPdpLpCount(
  storeDomain: string,
  handle: string,
  canonicalUrl: string
): Promise<{ lpCount: number; adCount: number }> {
  const normCanon = normalizeUrl(canonicalUrl) ?? canonicalUrl;
  const pathHint = `/products/${handle}`;
  const lps = await prisma.landingPage.findMany({
    where: {
      OR: [
        { url: normCanon },
        { domain: storeDomain, path: { contains: pathHint } },
      ],
    },
    select: { id: true },
    take: 40,
  });
  const lpIds = lps.map((l) => l.id);
  if (!lpIds.length) return { lpCount: 0, adCount: 0 };
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
  const ads = new Set<string>();
  for (const a of fromJoin) ads.add(a.id);
  for (const r of infer) ads.add(r.fromEntityId);
  return { lpCount: lpIds.length, adCount: ads.size };
}

export async function recomputeAdFusion(
  adId: string,
  options: { signals?: FusionSignalRow[] } = {}
): Promise<void> {
  const signals = options.signals ?? (await loadFusionSignals());
  const ad = await prisma.ad.findUnique({
    where: { id: adId },
    include: {
      landingPages: { select: { id: true } },
      confidenceScores: { take: 1 },
      entityLinks: {
        where: { OR: [{ entityType: "PRODUCT" }, { entityType: "STORE" }] },
        select: { entityType: true, entityId: true, linkStrength: true },
      },
    },
  });
  if (!ad) throw new Error(`Ad not found: ${adId}`);

  const repeatedMeta =
    (ad.canonicalUrl != null &&
      signalIncludesId(signals, "repeated_ad_destination", adId)) ||
    (ad.canonicalUrl
      ? (
          await prisma.ad.count({
            where: { canonicalUrl: ad.canonicalUrl, NOT: { id: adId } },
          })
        ) > 0
      : false);

  let activeRunDays = 0;
  if (ad.startDate) {
    const end = ad.endDate ?? new Date();
    activeRunDays = Math.max(0, (end.getTime() - ad.startDate.getTime()) / 86400000);
  }
  const activeDurationScore = Math.min(1, activeRunDays / 120) * (ad.isActive !== false ? 1 : 0.45);

  const storeInfer = await prisma.inferredLink.findFirst({
    where: { fromEntityId: adId, fromEntityType: "AD", toEntityType: "STORE" },
    select: { toEntityId: true },
  });
  const storeFromLink = ad.entityLinks.find((l) => l.entityType === "STORE");
  const storeId = storeInfer?.toEntityId ?? storeFromLink?.entityId ?? null;
  const store = storeId
    ? await prisma.store.findUnique({
        where: { id: storeId },
        select: {
          trafficScore: true,
          lastSeenAt: true,
        },
      })
    : null;
  const storeTrafficNorm = store?.trafficScore != null ? store.trafficScore / 100 : 0.35;

  const productIds = ad.entityLinks.filter((l) => l.entityType === "PRODUCT").map((l) => l.entityId);
  const products =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: productIds.slice(0, 12) } },
          select: {
            trafficScore: true,
            prominenceScore: true,
            collectionMemberships: { select: { collectionId: true } },
          },
        })
      : [];
  let maxProdTraffic = 0;
  let maxProminence = 0;
  let maxCollections = 0;
  for (const p of products) {
    maxProdTraffic = Math.max(maxProdTraffic, p.trafficScore ?? 0);
    maxProminence = Math.max(maxProminence, p.prominenceScore ?? 0);
    maxCollections = Math.max(maxCollections, p.collectionMemberships.length);
  }
  const prodTrafficNorm = maxProdTraffic / 100;
  const prominenceNorm = maxProminence / 100;
  const collectionDepthScore = Math.min(1, maxCollections / 6);

  const lpCount = ad.landingPages.length;
  const linkStrengths = await prisma.entityLink.findMany({
    where: { adId },
    select: { linkStrength: true },
    take: 40,
  });
  const avgStrength =
    linkStrengths.length === 0
      ? 0.5
      : linkStrengths.reduce((a, l) => a + (l.linkStrength ?? 0.85), 0) / linkStrengths.length;
  const landingConfirmScore = Math.min(1, (lpCount / 5) * 0.55 + avgStrength * 0.45);

  const storeFreshDays = store ? (Date.now() - store.lastSeenAt.getTime()) / 86400000 : 999;
  const storeFreshScore = storeFreshDays <= 21 ? 1 : storeFreshDays <= 45 ? 0.65 : 0.35;

  const confNorm = confidenceV2Norm(ad.confidenceScores[0]);

  const mergeConflict = await prisma.mergeCandidate.findFirst({
    where: {
      entityType: "AD",
      level: "CONFLICT",
      OR: [{ primaryEntityId: adId }, { candidateEntityId: adId }],
    },
    select: { id: true },
  });

  const staleAdDays = (Date.now() - ad.lastSeenAt.getTime()) / 86400000;
  const staleAdPenalty = staleAdDays > 50 ? Math.min(18, (staleAdDays - 50) * 0.2) : 0;

  const brokenLanding = signalIncludesId(signals, "broken_landing_reference", adId);

  let dupLinkedPenalty = 0;
  for (const pid of productIds.slice(0, 8)) {
    if (signalIncludesId(signals, "duplicate_product_cluster", pid)) {
      dupLinkedPenalty = 10;
      break;
    }
  }

  const multiAdStore =
    storeId != null && signalIncludesId(signals, "multi_ad_same_store", storeId);

  const W_AD = {
    metaRepeat: 0.14,
    activeRun: 0.09,
    storeTraffic: 0.16,
    prodTraffic: 0.11,
    prominence: 0.13,
    landingConf: 0.12,
    storeFresh: 0.07,
    collectionDepth: 0.06,
    confidenceV2: 0.12,
  } as const;

  const weighted = {
    metaRepeat: W_AD.metaRepeat * (repeatedMeta ? 1 : 0.25),
    activeRun: W_AD.activeRun * activeDurationScore,
    storeTraffic: W_AD.storeTraffic * storeTrafficNorm,
    prodTraffic: W_AD.prodTraffic * prodTrafficNorm,
    prominence: W_AD.prominence * prominenceNorm,
    landingConf: W_AD.landingConf * landingConfirmScore,
    storeFresh: W_AD.storeFresh * storeFreshScore,
    collectionDepth: W_AD.collectionDepth * collectionDepthScore,
    confidenceV2: W_AD.confidenceV2 * confNorm,
  };

  let penalties = 0;
  if (mergeConflict) penalties += 14;
  penalties += staleAdPenalty;
  if (brokenLanding) penalties += 12;
  penalties += dupLinkedPenalty;
  const penaltyObj: Record<string, number> = {
    mergeConflict: mergeConflict ? 14 : 0,
    staleAd: staleAdPenalty,
    brokenLanding: brokenLanding ? 12 : 0,
    duplicateProductLink: dupLinkedPenalty,
  };

  const sumW = Object.values(weighted).reduce((a, b) => a + b, 0);
  const bonusMultiAd = multiAdStore ? 4 : 0;
  const score = clamp100(sumW * 100 + bonusMultiAd - penalties);
  const level = opportunityLevelFromScore(score);

  const reasonCodes: FusionReasonCode[] = [];
  if (repeatedMeta) reasonCodes.push("META_AD_REPETITION");
  if (activeDurationScore >= 0.5) reasonCodes.push("LONG_ACTIVE_RUN");
  if (storeTrafficNorm >= 0.45) reasonCodes.push("LINKED_STORE_TRAFFIC");
  if (prodTrafficNorm >= 0.35) reasonCodes.push("LINKED_PRODUCT_TRAFFIC");
  if (prominenceNorm >= 0.45) reasonCodes.push("PRODUCT_PROMINENCE");
  if (landingConfirmScore >= 0.55) reasonCodes.push("LANDING_CONFIRMATIONS");
  if (storeFreshScore >= 0.9) reasonCodes.push("STORE_FRESH");
  if (collectionDepthScore >= 0.45) reasonCodes.push("COLLECTION_DEPTH");
  if (confNorm >= 0.65) reasonCodes.push("CONFIDENCE_V2_BONUS");
  if (mergeConflict) reasonCodes.push("AD_MERGE_CONFLICT");
  if (staleAdPenalty > 0) reasonCodes.push("STALE_AD_PENALTY");
  if (brokenLanding) reasonCodes.push("BROKEN_LANDING_SIGNAL");
  if (dupLinkedPenalty > 0) reasonCodes.push("DUPLICATE_PRODUCT_LINK_PENALTY");
  if (multiAdStore) reasonCodes.push("MULTI_AD_STORE_PRESSURE");

  const opportunitySignals: string[] = [];
  if (repeatedMeta) opportunitySignals.push("META_REPETITION_STRONG");
  if (multiAdStore) opportunitySignals.push("STORE_AD_PRESSURE_CLUSTER");
  if (level === "BREAKOUT") opportunitySignals.push("BREAKOUT_CANDIDATE");

  const breakoutHints: string[] = [];
  if (level === "BREAKOUT") {
    breakoutHints.push("Breakout-class winning probability — prioritize catalog / creative review");
  }
  if (repeatedMeta) {
    breakoutHints.push("Destination overlaps other Meta ads (sustained spend signal)");
  }
  if (multiAdStore && storeTrafficNorm >= 0.5) {
    breakoutHints.push("High store traffic with multi-ad cluster");
  }

  const breakdown: FusionBreakdown = {
    version: FUSION_BREAKDOWN_VERSION,
    entity: "AD",
    inputs: {
      repeatedMeta,
      activeRunDays,
      storeId,
      maxProdTraffic,
      maxProminence,
      maxCollections,
      lpCount,
      avgStrength,
      storeFreshDays,
      confNorm,
      multiAdStore,
      multiAdBonusPoints: bonusMultiAd,
    },
    weighted: { ...weighted, _sum: sumW },
    penalties: penaltyObj,
    opportunitySignals,
    breakoutHints,
    computedAt: new Date().toISOString(),
  };

  await prisma.ad.update({
    where: { id: adId },
    data: {
      winningProbabilityScore: score,
      opportunityLevel: level,
      fusionReasonCodes: reasonCodes,
      fusionBreakdown: breakdown as object as Prisma.InputJsonValue,
      opportunityUpdatedAt: new Date(),
    },
  });
}

export async function recomputeStoreFusion(
  storeId: string,
  options: { signals?: FusionSignalRow[] } = {}
): Promise<void> {
  const signals = options.signals ?? (await loadFusionSignals());
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      confidenceScores: { take: 1 },
      _count: { select: { products: true } },
    },
  });
  if (!store) throw new Error(`Store not found: ${storeId}`);

  const adEdges = await prisma.inferredLink.count({
    where: { toEntityType: "STORE", toEntityId: storeId, fromEntityType: "AD" },
  });
  const adPressure = Math.min(1, adEdges / 15);
  const multiAd = signalIncludesId(signals, "multi_ad_same_store", storeId);
  const staleSig = signalIncludesId(signals, "stale_store", storeId);

  const trafficNorm = store.trafficScore != null ? store.trafficScore / 100 : 0.3;

  const prodAgg = await prisma.product.aggregate({
    where: { storeId },
    _avg: { prominenceScore: true, trafficScore: true },
  });
  const avgProm = prodAgg._avg.prominenceScore ?? 0;
  const avgProdTraffic = prodAgg._avg.trafficScore ?? 0;
  const catalogBlend = Math.min(1, (avgProm / 100) * 0.55 + (avgProdTraffic / 100) * 0.45);

  const mergeRisk = await prisma.mergeCandidate.findFirst({
    where: {
      entityType: "STORE",
      OR: [{ primaryEntityId: storeId }, { candidateEntityId: storeId }],
      level: { in: ["CONFLICT", "PROBABLE"] },
    },
    select: { id: true },
  });

  const freshDays = (Date.now() - store.lastSeenAt.getTime()) / 86400000;
  const freshScore = freshDays <= 25 ? 1 : freshDays <= 50 ? 0.6 : 0.3;

  const confNorm = confidenceV2Norm(store.confidenceScores[0]);

  const W_S = {
    adPressure: 0.22,
    traffic: 0.28,
    catalog: 0.2,
    fresh: 0.12,
    confidence: 0.18,
  } as const;

  let weightedSum =
    W_S.adPressure * adPressure +
    W_S.traffic * trafficNorm +
    W_S.catalog * catalogBlend +
    W_S.fresh * freshScore +
    W_S.confidence * confNorm;
  if (multiAd) weightedSum += 0.06;

  const staleDaysPenalty = freshDays > 55 ? Math.min(14, (freshDays - 55) * 0.18) : 0;
  const penaltyObj: Record<string, number> = {
    staleSignal: staleSig ? 12 : 0,
    mergeRisk: mergeRisk ? 8 : 0,
    staleDays: staleDaysPenalty,
  };
  const penalties =
    penaltyObj.staleSignal + penaltyObj.mergeRisk + penaltyObj.staleDays;

  const score = clamp100(weightedSum * 100 - penalties);
  const level = opportunityLevelFromScore(score);

  const reasonCodes: FusionReasonCode[] = [];
  if (adPressure >= 0.35) reasonCodes.push("MULTI_AD_STORE_PRESSURE");
  if (trafficNorm >= 0.45) reasonCodes.push("LINKED_STORE_TRAFFIC");
  if (catalogBlend >= 0.4) reasonCodes.push("CATALOG_PROMINENCE_BLEND");
  if (freshScore >= 0.85) reasonCodes.push("STORE_FRESH");
  if (confNorm >= 0.6) reasonCodes.push("CONFIDENCE_V2_BONUS");
  if (mergeRisk) reasonCodes.push("STORE_MERGE_RISK");
  if (staleSig || staleDaysPenalty > 0) reasonCodes.push("STALE_STORE_PENALTY");

  const opportunitySignals: string[] = [];
  if (multiAd) opportunitySignals.push("MULTI_AD_STORE");
  if (adEdges >= 5) opportunitySignals.push("HIGH_AD_FANIN");

  const breakoutHints: string[] = [];
  if (level === "BREAKOUT") {
    breakoutHints.push("Store shows breakout fusion — strong ad + catalog co-signal");
  }
  if (multiAd && trafficNorm >= 0.55) {
    breakoutHints.push("Several ads infer to this store with healthy traffic score");
  }

  const breakdown: FusionBreakdown = {
    version: FUSION_BREAKDOWN_VERSION,
    entity: "STORE",
    inputs: {
      adEdges,
      multiAd,
      trafficNorm,
      catalogBlend,
      freshDays,
      productCount: store._count.products,
    },
    weighted: {
      adPressure: W_S.adPressure * adPressure,
      traffic: W_S.traffic * trafficNorm,
      catalog: W_S.catalog * catalogBlend,
      fresh: W_S.fresh * freshScore,
      confidence: W_S.confidence * confNorm,
      multiAdBoost: multiAd ? 0.06 : 0,
      _sum: weightedSum,
    },
    penalties: penaltyObj,
    opportunitySignals,
    breakoutHints,
    computedAt: new Date().toISOString(),
  };

  await prisma.store.update({
    where: { id: storeId },
    data: {
      winningProbabilityScore: score,
      opportunityLevel: level,
      fusionReasonCodes: reasonCodes,
      fusionBreakdown: breakdown as object as Prisma.InputJsonValue,
      opportunityUpdatedAt: new Date(),
    },
  });
}

export async function recomputeProductFusion(
  productId: string,
  options: { signals?: FusionSignalRow[] } = {}
): Promise<void> {
  const signals = options.signals ?? (await loadFusionSignals());
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      store: true,
      collectionMemberships: { select: { collectionId: true } },
      confidenceScores: { take: 1 },
    },
  });
  if (!product) throw new Error(`Product not found: ${productId}`);

  const { adCount, lpCount } = await adsTouchingPdpLpCount(
    product.store.domain,
    product.handle,
    product.canonicalUrl
  );
  const pdpPressure = Math.min(1, adCount / 8 + lpCount * 0.06);

  const trafficNorm = product.trafficScore != null ? product.trafficScore / 100 : 0.28;
  const prominenceNorm = product.prominenceScore != null ? product.prominenceScore / 100 : 0.25;
  const storeTrafficNorm =
    product.store.trafficScore != null ? product.store.trafficScore / 100 : 0.3;

  const collectionDepth = Math.min(1, product.collectionMemberships.length / 5);
  const confNorm = confidenceV2Norm(product.confidenceScores[0]);

  const dupCluster = signalIncludesId(signals, "duplicate_product_cluster", productId);
  const staleDays = (Date.now() - product.lastSeenAt.getTime()) / 86400000;
  const stalePenalty = staleDays > 50 ? Math.min(16, (staleDays - 50) * 0.2) : 0;

  const W_P = {
    pdpAds: 0.26,
    traffic: 0.2,
    prominence: 0.2,
    storeTraffic: 0.14,
    collections: 0.08,
    confidence: 0.12,
  } as const;

  const weighted = {
    pdpAds: W_P.pdpAds * pdpPressure,
    traffic: W_P.traffic * trafficNorm,
    prominence: W_P.prominence * prominenceNorm,
    storeTraffic: W_P.storeTraffic * storeTrafficNorm,
    collections: W_P.collections * collectionDepth,
    confidence: W_P.confidence * confNorm,
  };
  const sumW = Object.values(weighted).reduce((a, b) => a + b, 0);
  const penalties = stalePenalty + (dupCluster ? 12 : 0);
  const score = clamp100(sumW * 100 - penalties);
  const level = opportunityLevelFromScore(score);

  const reasonCodes: FusionReasonCode[] = [];
  if (adCount >= 2) reasonCodes.push("PDP_AD_PRESSURE");
  if (trafficNorm >= 0.4) reasonCodes.push("LINKED_PRODUCT_TRAFFIC");
  if (prominenceNorm >= 0.45) reasonCodes.push("PRODUCT_PROMINENCE");
  if (storeTrafficNorm >= 0.4) reasonCodes.push("STORE_TRAFFIC_BLEND");
  if (collectionDepth >= 0.35) reasonCodes.push("COLLECTION_DEPTH");
  if (confNorm >= 0.6) reasonCodes.push("CONFIDENCE_V2_BONUS");
  if (dupCluster) reasonCodes.push("DUPLICATE_CLUSTER_PENALTY");
  if (stalePenalty > 0) reasonCodes.push("STALE_PRODUCT_PENALTY");

  const opportunitySignals: string[] = [];
  if (adCount >= 4) opportunitySignals.push("HIGH_PDP_AD_FANIN");
  if (level === "BREAKOUT") opportunitySignals.push("PRODUCT_BREAKOUT_WINDOW");

  const breakoutHints: string[] = [];
  if (level === "BREAKOUT") {
    breakoutHints.push("Product fusion breakout — strong ad + PDP + catalog alignment");
  }
  if (adCount >= 3 && prominenceNorm >= 0.55) {
    breakoutHints.push("Multiple ads land on PDP with elevated prominence");
  }

  const breakdown: FusionBreakdown = {
    version: FUSION_BREAKDOWN_VERSION,
    entity: "PRODUCT",
    inputs: {
      adCount,
      lpCount,
      trafficNorm,
      prominenceNorm,
      storeTrafficNorm,
      collectionCount: product.collectionMemberships.length,
      staleDays,
      dupCluster,
    },
    weighted: { ...weighted, _sum: sumW },
    penalties: { stale: stalePenalty, duplicateCluster: dupCluster ? 12 : 0 },
    opportunitySignals,
    breakoutHints,
    computedAt: new Date().toISOString(),
  };

  await prisma.product.update({
    where: { id: productId },
    data: {
      winningProbabilityScore: score,
      opportunityLevel: level,
      fusionReasonCodes: reasonCodes,
      fusionBreakdown: breakdown as object as Prisma.InputJsonValue,
      opportunityUpdatedAt: new Date(),
    },
  });
}

export async function batchRecomputeFusionScores(options: {
  storeLimit?: number;
  productLimit?: number;
  adLimit?: number;
} = {}): Promise<{
  stores: number;
  products: number;
  ads: number;
  errors: string[];
}> {
  const storeLimit = options.storeLimit ?? 500;
  const productLimit = options.productLimit ?? 900;
  const adLimit = options.adLimit ?? 600;
  const signals = await loadFusionSignals();
  const errors: string[] = [];
  let stores = 0;
  let products = 0;
  let ads = 0;

  const storeRows = await prisma.store.findMany({
    select: { id: true },
    orderBy: { lastSeenAt: "desc" },
    take: storeLimit,
  });
  for (const r of storeRows) {
    try {
      await recomputeStoreFusion(r.id, { signals });
      stores++;
    } catch (e) {
      errors.push(`store ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const productRows = await prisma.product.findMany({
    select: { id: true },
    orderBy: { lastSeenAt: "desc" },
    take: productLimit,
  });
  for (const r of productRows) {
    try {
      await recomputeProductFusion(r.id, { signals });
      products++;
    } catch (e) {
      errors.push(`product ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const adRows = await prisma.ad.findMany({
    select: { id: true },
    orderBy: { lastSeenAt: "desc" },
    take: adLimit,
  });
  for (const r of adRows) {
    try {
      await recomputeAdFusion(r.id, { signals });
      ads++;
    } catch (e) {
      errors.push(`ad ${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { stores, products, ads, errors };
}
