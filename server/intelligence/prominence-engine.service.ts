import prisma from "@/lib/prisma";
import type { Prisma, ProminenceLevel } from "@prisma/client";
import { normalizeUrl } from "@/lib/url";

export const PROMINENCE_BREAKDOWN_VERSION = 1 as const;

export type ProminenceReasonCode =
  | "HOMEPAGE_LP_LINKED"
  | "HERO_COLLECTION_MEMBERSHIP"
  | "MULTIPLE_COLLECTIONS"
  | "STRONG_LIST_POSITION"
  | "COLLECTION_DIVERSITY"
  | "ADS_DRIVE_PDP"
  | "REPEATED_PDP_LANDING_PAGES"
  | "RICH_PRODUCT_MEDIA"
  | "REPEATED_SYNC_CONFIRMATIONS"
  | "STORE_TRAFFIC_LIFT"
  | "HOMEPAGE_PATH_INFERENCE"
  | "STALE_PRODUCT_PENALTY"
  | "DUPLICATE_CLUSTER_PENALTY";

export interface ProminenceBreakdown {
  version: typeof PROMINENCE_BREAKDOWN_VERSION;
  prominenceScore: number;
  prominenceLevel: ProminenceLevel;
  storeProminenceContribution: number;
  inputs: Record<string, number | string | boolean | null>;
  weighted: Record<string, number> & { _sum?: number };
  penalties: Record<string, number>;
  insights: {
    collectionDiversity: string;
    homepageNote: string;
  };
  computedAt: string;
}

const W = {
  homepageLpLink: 0.13,
  heroCollectionHandle: 0.09,
  multiCollection: 0.11,
  collectionPosition: 0.11,
  collectionDiversity: 0.09,
  adsToPdp: 0.17,
  repeatedPdpLp: 0.09,
  imageCompleteness: 0.08,
  syncConfirmations: 0.07,
  storeTrafficContribution: 0.12,
  homepagePathInference: 0.04,
} as const;

const HERO_COLLECTION_HANDLES = new Set([
  "frontpage",
  "homepage",
  "home",
  "featured",
  "feature",
  "best-sellers",
  "bestsellers",
  "new-arrivals",
  "new-arrival",
  "all",
]);

function clamp100(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function isHomepagePath(path: string): boolean {
  const p = path.trim();
  if (p === "" || p === "/") return true;
  const lower = p.toLowerCase();
  return lower === "/index" || lower === "/index.html" || lower === "/home";
}

function levelFromScore(score: number): ProminenceLevel {
  if (score >= 82) return "HERO";
  if (score >= 58) return "FEATURED";
  if (score >= 32) return "STANDARD";
  return "WEAK";
}

function asIdArray(raw: Prisma.JsonValue): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export async function loadProminenceSignals() {
  return prisma.intelligenceSignal.findMany({
    where: {
      active: true,
      type: "duplicate_product_cluster",
    },
    select: { type: true, relatedEntityIds: true },
    take: 2000,
  });
}

type ProminenceSignalRow = Awaited<ReturnType<typeof loadProminenceSignals>>[number];

function productInDuplicateCluster(signals: ProminenceSignalRow[], productId: string): boolean {
  for (const s of signals) {
    if (asIdArray(s.relatedEntityIds as Prisma.JsonValue).includes(productId)) return true;
  }
  return false;
}

export async function recomputeProductProminence(
  productId: string,
  options: { signals?: ProminenceSignalRow[] } = {}
): Promise<{
  score: number;
  level: ProminenceLevel;
  breakdown: ProminenceBreakdown;
  reasonCodes: ProminenceReasonCode[];
}> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      store: true,
      collectionMemberships: {
        include: { collection: { select: { id: true, handle: true, title: true } } },
      },
      confidenceScores: { take: 1 },
      entityLinks: { where: { entityType: "LANDING_PAGE" } },
    },
  });
  if (!product) throw new Error(`Product not found: ${productId}`);

  const signals = options.signals ?? (await loadProminenceSignals());
  const store = product.store;
  const normCanon = normalizeUrl(product.canonicalUrl) ?? product.canonicalUrl;
  const pathHint = `/products/${product.handle}`;

  const pdpLps = await prisma.landingPage.findMany({
    where: {
      OR: [
        { url: normCanon },
        { domain: store.domain, path: { contains: pathHint } },
      ],
    },
    select: { id: true, path: true, domain: true, url: true },
    take: 40,
  });
  const pdpLpIds = pdpLps.map((l) => l.id);

  const domainLps = await prisma.landingPage.findMany({
    where: { domain: store.domain },
    select: { id: true, path: true },
    take: 150,
  });
  const homeLpIds = new Set<string>();
  for (const lp of domainLps) {
    if (isHomepagePath(lp.path)) homeLpIds.add(lp.id);
  }

  const lpEntityIds = new Set(product.entityLinks.map((l) => l.entityId));
  const homepageLinked =
    [...lpEntityIds].some((id) => homeLpIds.has(id)) ||
    pdpLpIds.some((id) => homeLpIds.has(id));

  let homepagePathInference = false;
  if (!homepageLinked && pdpLps.length) {
    homepagePathInference = pdpLps.some((lp) => isHomepagePath(lp.path));
  }

  const inHeroCollection = product.collectionMemberships.some((m) =>
    HERO_COLLECTION_HANDLES.has(m.collection.handle.toLowerCase())
  );

  const collectionCount = product.collectionMemberships.length;
  const distinctHandles = new Set(
    product.collectionMemberships.map((m) => m.collection.handle.toLowerCase())
  );
  const diversityScore = Math.min(1, distinctHandles.size / 5);

  const positions = product.collectionMemberships
    .map((m) => m.position)
    .filter((n): n is number => n != null && n >= 0);
  const bestPosition = positions.length ? Math.min(...positions) : null;
  const positionScore =
    bestPosition == null ? 0.42 : bestPosition <= 3 ? 1 : bestPosition <= 12 ? 0.68 : 0.38;

  let adsToPdp = 0;
  if (pdpLpIds.length) {
    const fromJoin = await prisma.ad.findMany({
      where: { landingPages: { some: { id: { in: pdpLpIds } } } },
      select: { id: true },
    });
    const infer = await prisma.inferredLink.findMany({
      where: {
        toEntityType: "LANDING_PAGE",
        toEntityId: { in: pdpLpIds },
        fromEntityType: "AD",
      },
      select: { fromEntityId: true },
    });
    const adSet = new Set<string>();
    for (const a of fromJoin) adSet.add(a.id);
    for (const r of infer) adSet.add(r.fromEntityId);
    adsToPdp = adSet.size;
  }

  const repeatedPdpLp = pdpLpIds.length >= 2 || product.entityLinks.length >= 2 ? 1 : 0;

  const imgN = (product.images?.length ?? 0) + (product.featuredImage ? 1 : 0);
  const imageCompleteness = Math.min(1, imgN / 5);

  const syncCount = product.confidenceScores[0]?.syncCount ?? 1;
  const syncConfirmations = Math.min(1, 0.3 + (syncCount - 1) * 0.14);

  const storeTraffic = store.trafficScore;
  const storeTrafficContribution =
    storeTraffic != null ? Math.min(1, storeTraffic / 100) : 0.28;

  const weighted = {
    homepageLpLink: W.homepageLpLink * (homepageLinked ? 1 : 0),
    heroCollectionHandle: W.heroCollectionHandle * (inHeroCollection ? 1 : 0),
    multiCollection: W.multiCollection * Math.min(1, collectionCount / 4),
    collectionPosition: W.collectionPosition * positionScore,
    collectionDiversity: W.collectionDiversity * diversityScore,
    adsToPdp: W.adsToPdp * Math.min(1, adsToPdp / 8),
    repeatedPdpLp: W.repeatedPdpLp * repeatedPdpLp,
    imageCompleteness: W.imageCompleteness * imageCompleteness,
    syncConfirmations: W.syncConfirmations * syncConfirmations,
    storeTrafficContribution: W.storeTrafficContribution * storeTrafficContribution,
    homepagePathInference:
      W.homepagePathInference * (homepagePathInference && !homepageLinked ? 1 : 0),
  };

  let stalePenalty = 0;
  const daysSince = (Date.now() - product.lastSeenAt.getTime()) / 86400000;
  if (daysSince > 55) stalePenalty = Math.min(16, (daysSince - 55) * 0.22);

  let dupPenalty = 0;
  if (productInDuplicateCluster(signals, productId)) dupPenalty = 12;

  const penalties = { stale: stalePenalty, duplicateCluster: dupPenalty };
  const sumW = Object.values(weighted).reduce((a, b) => a + b, 0);
  const sumP = Object.values(penalties).reduce((a, b) => a + b, 0);
  const score = clamp100(sumW * 100 - sumP);
  const level = levelFromScore(score);

  const reasonCodes: ProminenceReasonCode[] = [];
  if (homepageLinked) reasonCodes.push("HOMEPAGE_LP_LINKED");
  if (inHeroCollection) reasonCodes.push("HERO_COLLECTION_MEMBERSHIP");
  if (collectionCount >= 2) reasonCodes.push("MULTIPLE_COLLECTIONS");
  if (bestPosition != null && bestPosition <= 6) reasonCodes.push("STRONG_LIST_POSITION");
  if (distinctHandles.size >= 2) reasonCodes.push("COLLECTION_DIVERSITY");
  if (adsToPdp > 0) reasonCodes.push("ADS_DRIVE_PDP");
  if (repeatedPdpLp) reasonCodes.push("REPEATED_PDP_LANDING_PAGES");
  if (imageCompleteness >= 0.5) reasonCodes.push("RICH_PRODUCT_MEDIA");
  if (syncCount >= 2) reasonCodes.push("REPEATED_SYNC_CONFIRMATIONS");
  if (storeTraffic != null && storeTraffic >= 40) reasonCodes.push("STORE_TRAFFIC_LIFT");
  if (homepagePathInference && !homepageLinked) reasonCodes.push("HOMEPAGE_PATH_INFERENCE");
  if (stalePenalty > 0) reasonCodes.push("STALE_PRODUCT_PENALTY");
  if (dupPenalty > 0) reasonCodes.push("DUPLICATE_CLUSTER_PENALTY");

  const collectionDiversity = `${distinctHandles.size} distinct collection handle(s) across ${collectionCount} membership(s)${
    bestPosition != null ? ` · best position ${bestPosition}` : " · no list position from source"
  }`;

  const homepageNote = homepageLinked
    ? "Homepage-class landing page is linked to this product in the graph (root path on store domain)."
    : homepagePathInference
      ? "A linked PDP URL uses a homepage-style path; treat as weak structural hint only."
      : "No homepage landing linkage detected for this product.";

  const breakdown: ProminenceBreakdown = {
    version: PROMINENCE_BREAKDOWN_VERSION,
    prominenceScore: score,
    prominenceLevel: level,
    storeProminenceContribution: clamp100(
      W.storeTrafficContribution * storeTrafficContribution * 100
    ),
    inputs: {
      homepageLinked,
      homepagePathInference,
      inHeroCollection,
      collectionCount,
      distinctCollectionHandles: distinctHandles.size,
      bestPosition,
      adsToPdp,
      pdpLandingPageCount: pdpLpIds.length,
      productLpEntityLinks: product.entityLinks.length,
      imageSlots: imgN,
      syncCount,
      storeTrafficScore: storeTraffic ?? null,
      daysSinceSeen: daysSince,
    },
    weighted: { ...weighted, _sum: sumW },
    penalties,
    insights: { collectionDiversity, homepageNote },
    computedAt: new Date().toISOString(),
  };

  await prisma.product.update({
    where: { id: productId },
    data: {
      prominenceScore: score,
      prominenceLevel: level,
      prominenceBreakdown: breakdown as object as Prisma.InputJsonValue,
      prominenceUpdatedAt: new Date(),
      prominenceReasonCodes: reasonCodes,
    },
  });

  return { score, level, breakdown, reasonCodes };
}

export async function batchRecomputeProductProminence(options: { limit?: number } = {}): Promise<{
  updated: number;
  errors: string[];
}> {
  const limit = options.limit ?? 900;
  const signals = await loadProminenceSignals();
  const rows = await prisma.product.findMany({
    select: { id: true },
    orderBy: { lastSeenAt: "desc" },
    take: limit,
  });
  const errors: string[] = [];
  let updated = 0;
  for (const r of rows) {
    try {
      await recomputeProductProminence(r.id, { signals });
      updated++;
    } catch (e) {
      errors.push(`${r.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { updated, errors };
}
