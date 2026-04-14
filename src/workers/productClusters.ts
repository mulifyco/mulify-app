import prisma from "@/src/lib/prisma";
import { createHash } from "crypto";
import {
  computeMarketLeaderScore,
  computeEarlyMoverScore,
  computeReadyToScaleScore,
  computeSaturatedScore,
  creativeOverlapForStoreIds,
  persistEarlyMoverForProductCluster,
  persistMarketLeaderForProductCluster,
  persistReadyToScaleForProductCluster,
  persistSaturatedForProductCluster,
} from "@/lib/intelligence/ready-to-scale";
import { openReviewQueueItem } from "@/server/services/review-queue.service";

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function hash16(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function normHandle(handle: string): string {
  return handle
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const STOP = new Set([
  "the",
  "and",
  "or",
  "for",
  "with",
  "to",
  "a",
  "an",
  "of",
  "in",
  "on",
  "at",
  "by",
  "from",
  "new",
  "best",
  "official",
  "shop",
  "store",
]);

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

function handlesPotentiallySameProduct(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  if ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 5) return true;
  if (Math.min(a.length, b.length) >= 6 && levenshtein(a, b) <= 1) return true;
  return false;
}

function normTitleKey(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = cleaned
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP.has(t));
  return tokens.slice(0, 8).join(" ");
}

function imageKey(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);
    const last = (parts[parts.length - 1] ?? "").toLowerCase();
    if (!last) return null;
    return `${host}/${last}`;
  } catch {
    // tolerate non-URL strings (rare)
    const s = url.split("?")[0].trim().toLowerCase();
    if (!s) return null;
    return s.length > 200 ? s.slice(-200) : s;
  }
}

type ProductScanRow = {
  id: string;
  storeId: string;
  handle: string;
  title: string;
  featuredImage: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  collectionMemberships: Array<{ collectionId: string }>;
  entityLinks: Array<{ landingPageId: string | null }>;
  _count: { entityLinks: number };
};

class UnionFind {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = Array.from({ length: n }, () => 0);
  }
  find(x: number): number {
    let p = this.parent[x]!;
    if (p !== x) this.parent[x] = this.find(p);
    return this.parent[x]!;
  }
  union(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rka = this.rank[ra]!;
    const rkb = this.rank[rb]!;
    if (rka < rkb) this.parent[ra] = rb;
    else if (rka > rkb) this.parent[rb] = ra;
    else {
      this.parent[rb] = ra;
      this.rank[ra] = rka + 1;
    }
  }
}

async function upsertClusterAndMembers(params: {
  key: string;
  title: string | null;
  handleNorm?: string | null;
  imageKey?: string | null;
  confidence: number;
  productIds: string[];
  storeIdsByProductId: Map<string, string>;
}): Promise<"created" | "updated"> {
  const now = new Date();
  const existing = await prisma.productCluster.findUnique({ where: { key: params.key }, select: { id: true } });

  const cluster = await prisma.productCluster.upsert({
    where: { key: params.key },
    create: {
      key: params.key,
      title: params.title ?? undefined,
      handleNorm: params.handleNorm ?? undefined,
      imageKey: params.imageKey ?? undefined,
      confidence: params.confidence,
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: { version: 1, createdBy: "refresh_product_clusters" } as never,
    },
    update: {
      title: params.title ?? undefined,
      handleNorm: params.handleNorm ?? undefined,
      imageKey: params.imageKey ?? undefined,
      confidence: params.confidence,
      lastSeenAt: now,
      metadata: { version: 1, updatedBy: "refresh_product_clusters" } as never,
    },
    select: { id: true },
  });

  // Upsert members by productId (unique).
  for (const pid of params.productIds) {
    const storeId = params.storeIdsByProductId.get(pid);
    if (!storeId) continue;
    await prisma.productClusterMember.upsert({
      where: { productId: pid },
      create: { productId: pid, clusterId: cluster.id, storeId },
      update: { clusterId: cluster.id, storeId },
    });
  }

  // Recompute cluster metrics from DB for consistency.
  const members = await prisma.productClusterMember.findMany({
    where: { clusterId: cluster.id },
    select: {
      storeId: true,
      product: {
        select: {
          id: true,
          firstSeenAt: true,
          lastSeenAt: true,
          _count: { select: { entityLinks: true } },
          entityLinks: { select: { landingPageId: true }, take: 200 },
          collectionMemberships: { select: { collectionId: true }, take: 200 },
        },
      },
    },
    take: 400,
    orderBy: { updatedAt: "desc" },
  });

  const storeIds = new Set<string>();
  const collectionIds = new Set<string>();
  const landingIds = new Set<string>();
  let linkedRawRecordCount = 0;
  let firstSeenAt = now;
  let lastSeenAt = new Date(0);

  for (const m of members) {
    storeIds.add(m.storeId);
    const p = m.product;
    linkedRawRecordCount += p._count.entityLinks;
    if (p.firstSeenAt < firstSeenAt) firstSeenAt = p.firstSeenAt;
    if (p.lastSeenAt > lastSeenAt) lastSeenAt = p.lastSeenAt;
    for (const el of p.entityLinks) if (el.landingPageId) landingIds.add(el.landingPageId);
    for (const cm of p.collectionMemberships) collectionIds.add(cm.collectionId);
  }

  const storeCount = storeIds.size || 1;
  const crossStoreScore = clampInt(((storeCount - 1) / 6) * 100, 0, 100);
  const saturationScore = clampInt((storeCount / 18) * 100, 0, 100);
  const freshnessDays = (Date.now() - lastSeenAt.getTime()) / 86400000;
  const freshnessScore = clampInt((1 - Math.min(14, Math.max(0, freshnessDays)) / 14) * 100, 0, 100);
  const winningScore = clampInt(crossStoreScore * 0.6 + freshnessScore * 0.4, 0, 100);

  const storeIdList = [...storeIds];
  const { linkedCreativeClusterCount, maxCreativeScaleScore } = await creativeOverlapForStoreIds(storeIdList);
  const readyToScaleScore = computeReadyToScaleScore({
    winningScore,
    saturationScore,
    storeCount,
    linkedRawRecordCount,
    lastSeenAt,
    maxCreativeScaleScore,
  });
  const marketLeaderScore = computeMarketLeaderScore({
    winningScore,
    saturationScore,
    storeCount,
    collectionCount: collectionIds.size,
    linkedRawRecordCount,
    firstSeenAt,
    lastSeenAt,
    readyToScaleScore,
    linkedCreativeClusterCount,
    maxCreativeScaleScore,
  });
  const earlyMoverScore = computeEarlyMoverScore({
    winningScore,
    readyToScaleScore,
    storeCount,
    linkedRawRecordCount,
    firstSeenAt,
    lastSeenAt,
    saturationScore,
    linkedCreativeClusterCount,
  });
  const persistenceDays = (lastSeenAt.getTime() - firstSeenAt.getTime()) / 86400000;
  const saturatedScore = computeSaturatedScore({
    saturationScore,
    marketLeaderScore,
    storeCount,
    collectionCount: collectionIds.size,
    linkedRawRecordCount,
    linkedCreativeClusterCount,
    firstSeenAt,
    lastSeenAt,
    readyToScaleScore,
    persistenceDays,
  });

  const landingTouches = members.reduce(
    (acc, m) => acc + m.product.entityLinks.filter((e) => e.landingPageId).length,
    0
  );
  let nextConf = params.confidence + Math.min(0.08, landingTouches / 100);
  if (storeCount >= 4 && !params.handleNorm && !params.imageKey) nextConf -= 0.06;
  if (storeCount === 1) nextConf += 0.05;
  nextConf = Math.max(0.38, Math.min(0.96, nextConf));

  await prisma.productCluster.update({
    where: { id: cluster.id },
    data: {
      storeCount,
      collectionCount: collectionIds.size,
      landingPageCount: landingIds.size,
      linkedRawRecordCount,
      firstSeenAt,
      lastSeenAt,
      saturationScore,
      winningScore,
      crossStoreScore,
      readyToScaleScore,
      marketLeaderScore,
      earlyMoverScore,
      saturatedScore,
      linkedCreativeClusterCount,
      confidence: nextConf,
    },
  });

  return existing ? "updated" : "created";
}

export async function refreshProductClustersJob(): Promise<{
  productsScanned: number;
  clustersCreated: number;
  clustersUpdated: number;
  lowConfidenceSkipped: number;
}> {
  const scanLimit = Number.parseInt(process.env.PRODUCT_CLUSTER_SCAN_LIMIT ?? "450", 10) || 450;
  const minMergeConfidence = Number.parseFloat(process.env.PRODUCT_CLUSTER_MIN_CONFIDENCE ?? "0.75") || 0.75;
  const maxClustersPerTick = Number.parseInt(process.env.PRODUCT_CLUSTER_MAX_CLUSTERS_PER_TICK ?? "120", 10) || 120;

  const products = (await prisma.product.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: scanLimit,
    select: {
      id: true,
      storeId: true,
      handle: true,
      title: true,
      featuredImage: true,
      firstSeenAt: true,
      lastSeenAt: true,
      collectionMemberships: { select: { collectionId: true }, take: 60 },
      entityLinks: { select: { landingPageId: true }, take: 80 },
      _count: { select: { entityLinks: true } },
    },
  })) as unknown as ProductScanRow[];

  const productsScanned = products.length;
  if (!products.length) {
    return { productsScanned: 0, clustersCreated: 0, clustersUpdated: 0, lowConfidenceSkipped: 0 };
  }

  const storeIdsByProductId = new Map(products.map((p) => [p.id, p.storeId]));
  const uf = new UnionFind(products.length);

  const byHandle = new Map<string, number[]>();
  const byImage = new Map<string, number[]>();
  const byTitle = new Map<string, number[]>();
  const byLanding = new Map<string, number[]>();

  const handleNorms: Array<string | null> = [];
  const titleKeys: Array<string | null> = [];
  const imageKeys: Array<string | null> = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i]!;
    const hn = p.handle ? normHandle(p.handle) : "";
    const tk = p.title ? normTitleKey(p.title) : "";
    const ik = imageKey(p.featuredImage);

    handleNorms[i] = hn || null;
    titleKeys[i] = tk || null;
    imageKeys[i] = ik;

    if (hn) byHandle.set(hn, [...(byHandle.get(hn) ?? []), i]);
    if (ik) byImage.set(ik, [...(byImage.get(ik) ?? []), i]);
    if (tk) byTitle.set(tk, [...(byTitle.get(tk) ?? []), i]);

    for (const el of p.entityLinks) {
      if (!el.landingPageId) continue;
      byLanding.set(el.landingPageId, [...(byLanding.get(el.landingPageId) ?? []), i]);
    }
  }

  let lowConfidenceSkipped = 0;

  function unionGroup(idxs: number[], confidence: number) {
    if (idxs.length < 2) return;
    if (confidence < minMergeConfidence) {
      lowConfidenceSkipped += 1;
      return;
    }
    const base = idxs[0]!;
    for (let j = 1; j < idxs.length; j++) uf.union(base, idxs[j]!);
  }

  // Strong merges (safe)
  for (const idxs of byHandle.values()) unionGroup(idxs, 0.92);
  for (const idxs of byLanding.values()) unionGroup(idxs, 0.86);
  for (const idxs of byImage.values()) unionGroup(idxs, 0.78);

  const byStoreIdx = new Map<string, number[]>();
  for (let i = 0; i < products.length; i++) {
    const sid = products[i]!.storeId;
    byStoreIdx.set(sid, [...(byStoreIdx.get(sid) ?? []), i]);
  }
  for (const idxs of byStoreIdx.values()) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const ia = idxs[a]!;
        const ib = idxs[b]!;
        const ha = handleNorms[ia];
        const hb = handleNorms[ib];
        if (ha && hb && handlesPotentiallySameProduct(ha, hb)) {
          unionGroup([ia, ib], 0.77);
        }
      }
    }
  }

  const byStoreTitle = new Map<string, number[]>();
  for (let i = 0; i < products.length; i++) {
    const tk = titleKeys[i];
    if (!tk) continue;
    const k = `${products[i]!.storeId}|${tk}`;
    byStoreTitle.set(k, [...(byStoreTitle.get(k) ?? []), i]);
  }
  for (const idxs of byStoreTitle.values()) {
    if (idxs.length < 2) continue;
    const grounded = idxs.filter((i) => {
      const p = products[i]!;
      return (
        p.entityLinks.some((e) => Boolean(e.landingPageId)) ||
        p.collectionMemberships.length > 0 ||
        Boolean(imageKeys[i])
      );
    });
    if (grounded.length >= 2) unionGroup(idxs, 0.76);
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < products.length; i++) {
    const r = uf.find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  }

  const sortedGroups = [...groups.values()].sort((a, b) => b.length - a.length).slice(0, maxClustersPerTick);

  let clustersCreated = 0;
  let clustersUpdated = 0;
  let reviewItemsOpened = 0;
  const reviewMax = Number.parseInt(process.env.REVIEW_QUEUE_MAX_PER_TICK ?? "12", 10) || 12;

  for (const idxs of sortedGroups) {
    const memberProducts = idxs.map((i) => products[i]!);
    const storeCount = new Set(memberProducts.map((p) => p.storeId)).size;

    // Determine signature preference: handle > image > title
    const hn = idxs.map((i) => handleNorms[i]).find(Boolean) ?? null;
    const ik = idxs.map((i) => imageKeys[i]).find(Boolean) ?? null;
    const tk = idxs.map((i) => titleKeys[i]).find(Boolean) ?? null;

    // If cross-store cluster can't be signed strongly, keep it conservative.
    const confidence =
      storeCount >= 2 && (hn || ik) ? 0.82 : storeCount >= 2 && tk ? 0.66 : hn || ik ? 0.74 : 0.6;

    if (storeCount >= 2 && confidence < minMergeConfidence) {
      lowConfidenceSkipped += 1;
      if (reviewItemsOpened < reviewMax) {
        const key =
          hn ? `pcl_v1:handle:${hn}` : ik ? `pcl_v1:img:${hash16(ik)}` : `pcl_v1:title:${hash16(tk ?? "unknown")}`;
        const primary = memberProducts[0];
        await openReviewQueueItem({
          type: "LOW_CONFIDENCE_PRODUCT_CLUSTER",
          dedupeKey: `pcl_low:${key}`,
          priority: Math.min(95, 60 + Math.floor(idxs.length * 3) + Math.floor(storeCount * 8)),
          title: `Low-confidence product cluster (${storeCount} stores)`,
          reason: `Skipped merge: confidence ${confidence.toFixed(2)} < min ${minMergeConfidence.toFixed(2)} · members:${idxs.length} · key:${key}`.slice(
            0,
            420
          ),
          entityType: primary?.id ? "PRODUCT" : null,
          entityId: primary?.id ?? null,
          sourceId: null,
          metadata: {
            clusterKey: key,
            confidence,
            minMergeConfidence,
            storeCount,
            memberCount: idxs.length,
            sampleProductIds: memberProducts.slice(0, 12).map((p) => p.id),
          },
        }).catch(() => null);
        reviewItemsOpened += 1;
      }
      continue;
    }

    const key =
      hn ? `pcl_v1:handle:${hn}` : ik ? `pcl_v1:img:${hash16(ik)}` : `pcl_v1:title:${hash16(tk ?? "unknown")}`;

    const title = memberProducts[0]?.title ?? null;

    const res = await upsertClusterAndMembers({
      key,
      title,
      handleNorm: hn,
      imageKey: ik,
      confidence,
      productIds: memberProducts.map((p) => p.id),
      storeIdsByProductId,
    });

    if (res === "created") clustersCreated += 1;
    else clustersUpdated += 1;
  }

  // Refresh ready-to-scale + creative overlap for recent clusters (creative clusters may update independently).
  const tailN = Number.parseInt(process.env.READY_TO_SCALE_REFRESH_TOP_N ?? "180", 10) || 180;
  const tail = await prisma.productCluster.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: tailN,
    select: { id: true },
  });
  for (const row of tail) {
    try {
      await persistReadyToScaleForProductCluster(row.id);
      await persistMarketLeaderForProductCluster(row.id);
      await persistEarlyMoverForProductCluster(row.id);
      await persistSaturatedForProductCluster(row.id);
    } catch {
      /* non-fatal */
    }
  }

  return { productsScanned, clustersCreated, clustersUpdated, lowConfidenceSkipped };
}

