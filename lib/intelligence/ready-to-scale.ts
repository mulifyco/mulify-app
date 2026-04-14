import prisma from "@/lib/prisma";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Composite 0–100: high winning + creative scale, penalize saturation, reward freshness
 * and moderate multi-store presence + lineage depth.
 */
export function computeReadyToScaleScore(input: {
  winningScore: number;
  saturationScore: number;
  storeCount: number;
  linkedRawRecordCount: number;
  lastSeenAt: Date;
  maxCreativeScaleScore: number;
}): number {
  const daysSince = (Date.now() - input.lastSeenAt.getTime()) / 86400000;
  const freshness = clamp(100 - (Math.min(21, Math.max(0, daysSince)) / 21) * 100, 0, 100);

  const storeSpread = clamp((input.storeCount / 8) * 100, 0, 100);
  const linkage = clamp((Math.log1p(input.linkedRawRecordCount) / Math.log1p(40)) * 100, 0, 100);
  const creative = clamp(input.maxCreativeScaleScore, 0, 100);
  const win = clamp(input.winningScore, 0, 100);
  const sat = clamp(input.saturationScore, 0, 100);

  const raw =
    win * 0.34 +
    creative * 0.26 +
    freshness * 0.16 +
    storeSpread * 0.12 +
    linkage * 0.12 -
    sat * 0.38;

  return Math.round(clamp(raw, 0, 100) * 100) / 100;
}

/**
 * Composite 0–100: dominant distribution + creative strength + proven persistence.
 * Saturation is neutral-to-positive here (leaders can be saturated).
 */
export function computeMarketLeaderScore(input: {
  winningScore: number;
  saturationScore: number;
  storeCount: number;
  collectionCount: number;
  linkedRawRecordCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  readyToScaleScore: number;
  linkedCreativeClusterCount: number;
  maxCreativeScaleScore: number;
}): number {
  const now = Date.now();
  const ageDays = (now - input.firstSeenAt.getTime()) / 86400000;
  const persistenceDays = (input.lastSeenAt.getTime() - input.firstSeenAt.getTime()) / 86400000;
  const daysSinceLast = (now - input.lastSeenAt.getTime()) / 86400000;

  // Needs to be durable: slightly penalize very new clusters.
  const maturity = clamp((Math.max(0, Math.min(45, ageDays)) / 45) * 100, 0, 100);
  // Leaders keep showing up: reward sustained visibility.
  const persistence = clamp((Math.max(0, Math.min(90, persistenceDays)) / 90) * 100, 0, 100);
  // Still should be alive.
  const freshness = clamp(100 - (Math.min(30, Math.max(0, daysSinceLast)) / 30) * 100, 0, 100);

  const storeSpread = clamp((input.storeCount / 18) * 100, 0, 100);
  const creativeMax = clamp(input.maxCreativeScaleScore, 0, 100);
  const creativeDensity =
    input.storeCount > 0
      ? clamp((input.linkedCreativeClusterCount / Math.max(1, input.storeCount)) * 100, 0, 100)
      : 0;
  const linkage = clamp((Math.log1p(input.linkedRawRecordCount) / Math.log1p(80)) * 100, 0, 100);
  const collections = clamp((Math.log1p(input.collectionCount) / Math.log1p(50)) * 100, 0, 100);

  const win = clamp(input.winningScore, 0, 100);
  const sat = clamp(input.saturationScore, 0, 100);
  const rts = clamp(input.readyToScaleScore, 0, 100);

  const raw =
    storeSpread * 0.22 +
    creativeMax * 0.18 +
    creativeDensity * 0.10 +
    linkage * 0.14 +
    collections * 0.06 +
    persistence * 0.16 +
    maturity * 0.06 +
    freshness * 0.06 +
    win * 0.06 +
    rts * 0.04 +
    sat * 0.06;

  return Math.round(clamp(raw, 0, 100) * 100) / 100;
}

/**
 * Composite 0–100: discover "fresh but accelerating" clusters before they saturate.
 * Emphasizes recency + early signal velocity, keeps saturation in low-mid sweet spot,
 * and penalizes old/slow clusters even if they have some scores.
 */
export function computeEarlyMoverScore(input: {
  winningScore: number;
  readyToScaleScore: number;
  storeCount: number;
  linkedRawRecordCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  saturationScore: number;
  linkedCreativeClusterCount: number;
}): number {
  const now = Date.now();
  const ageDays = (now - input.firstSeenAt.getTime()) / 86400000;
  const freshnessDays = (now - input.lastSeenAt.getTime()) / 86400000;

  // Strong positive for being new (0–60 days).
  const ageScore = clamp(100 - (Math.min(60, Math.max(0, ageDays)) / 60) * 100, 0, 100);

  // Must be very fresh (0–7 days).
  const freshnessScore = clamp(100 - (Math.min(7, Math.max(0, freshnessDays)) / 7) * 100, 0, 100);

  // Linkage "velocity" proxy: lots of links early is a breakout signal.
  const linkage = clamp((Math.log1p(input.linkedRawRecordCount) / Math.log1p(70)) * 100, 0, 100);
  const velocityBoost = clamp(linkage - clamp((Math.log1p(Math.max(0, ageDays)) / Math.log1p(60)) * 100, 0, 100), 0, 100);

  // Prefer low-mid saturation; penalize very low (no proof) and very high (too late).
  const sat = clamp(input.saturationScore, 0, 100);
  const satSweetSpot = clamp(100 - (Math.abs(sat - 35) / 35) * 100, 0, 100); // peak ~35
  const satExtremePenalty = clamp(Math.max(0, sat - 65) * 1.4, 0, 100);

  // Favor small but growing multi-store presence (2–6 is ideal).
  const stores = clamp(input.storeCount, 0, 1000);
  const storeEarly = clamp((Math.min(6, Math.max(0, stores)) / 6) * 100, 0, 100);
  const storePenalty = stores <= 1 ? 35 : stores >= 14 ? clamp((stores - 14) * 4, 0, 60) : 0;

  const creativeHint = clamp((Math.log1p(input.linkedCreativeClusterCount) / Math.log1p(12)) * 100, 0, 100);

  const win = clamp(input.winningScore, 0, 100);
  const rts = clamp(input.readyToScaleScore, 0, 100);

  // Penalize very old clusters (if still around, it's no longer "early").
  const oldPenalty = ageDays > 90 ? clamp((ageDays - 90) * 0.9, 0, 55) : 0;

  const raw =
    ageScore * 0.22 +
    freshnessScore * 0.20 +
    velocityBoost * 0.18 +
    satSweetSpot * 0.14 +
    storeEarly * 0.10 +
    creativeHint * 0.06 +
    win * 0.06 +
    rts * 0.04 -
    satExtremePenalty * 0.10 -
    storePenalty * 0.10 -
    oldPenalty * 0.18;

  return Math.round(clamp(raw, 0, 100) * 100) / 100;
}

/**
 * Composite 0–100: “too crowded / late” — high saturation, scale, creative repetition, and long visibility.
 * Market strength supports the story; ready-to-scale is a light secondary signal.
 */
export function computeSaturatedScore(input: {
  saturationScore: number;
  marketLeaderScore: number;
  storeCount: number;
  collectionCount: number;
  linkedRawRecordCount: number;
  linkedCreativeClusterCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  readyToScaleScore: number;
  persistenceDays: number;
}): number {
  const sat = clamp(input.saturationScore, 0, 100);
  const leader = clamp(input.marketLeaderScore, 0, 100);
  const rts = clamp(input.readyToScaleScore, 0, 100);

  const storeSpread = clamp((input.storeCount / 22) * 100, 0, 100);
  const creativeLoad = clamp((Math.log1p(input.linkedCreativeClusterCount) / Math.log1p(28)) * 100, 0, 100);
  const linkage = clamp((Math.log1p(input.linkedRawRecordCount) / Math.log1p(90)) * 100, 0, 100);
  const collections = clamp((Math.log1p(input.collectionCount) / Math.log1p(55)) * 100, 0, 100);
  const persistence = clamp((Math.max(0, input.persistenceDays) / 95) * 100, 0, 100);

  // Still visible recently → keeps saturation “real”, not a dead listing.
  const daysSinceLast = (Date.now() - input.lastSeenAt.getTime()) / 86400000;
  const recency = clamp(100 - (Math.min(25, Math.max(0, daysSinceLast)) / 25) * 100, 0, 100);

  const raw =
    sat * 0.30 +
    storeSpread * 0.20 +
    creativeLoad * 0.18 +
    persistence * 0.14 +
    leader * 0.10 +
    linkage * 0.04 +
    collections * 0.04 +
    rts * 0.06 +
    recency * 0.04;

  return Math.round(clamp(raw, 0, 100) * 100) / 100;
}

export async function creativeOverlapForStoreIds(
  storeIds: string[]
): Promise<{ linkedCreativeClusterCount: number; maxCreativeScaleScore: number }> {
  if (!storeIds.length) return { linkedCreativeClusterCount: 0, maxCreativeScaleScore: 0 };

  const stores = await prisma.store.findMany({
    where: { id: { in: [...new Set(storeIds)].slice(0, 80) } },
    select: { domain: true },
  });
  const domains = [...new Set(stores.map((s) => s.domain).filter(Boolean))];
  if (!domains.length) return { linkedCreativeClusterCount: 0, maxCreativeScaleScore: 0 };

  const shops = await prisma.shop.findMany({
    where: { domain: { in: domains } },
    select: { id: true },
    take: 100,
  });
  const shopIds = shops.map((s) => s.id);
  if (!shopIds.length) return { linkedCreativeClusterCount: 0, maxCreativeScaleScore: 0 };

  const members = await prisma.creativeClusterMember.findMany({
    where: { shopId: { in: shopIds } },
    select: { clusterId: true, cluster: { select: { scaleScore: true } } },
    take: 600,
  });

  const clusterIds = new Set(members.map((m) => m.clusterId));
  let maxCreativeScaleScore = 0;
  for (const m of members) {
    if (m.cluster.scaleScore > maxCreativeScaleScore) maxCreativeScaleScore = m.cluster.scaleScore;
  }

  return { linkedCreativeClusterCount: clusterIds.size, maxCreativeScaleScore };
}

export async function persistReadyToScaleForProductCluster(clusterId: string): Promise<void> {
  const cluster = await prisma.productCluster.findUnique({
    where: { id: clusterId },
    select: {
      winningScore: true,
      saturationScore: true,
      storeCount: true,
      linkedRawRecordCount: true,
      lastSeenAt: true,
    },
  });
  if (!cluster) return;

  const memberStores = await prisma.productClusterMember.findMany({
    where: { clusterId },
    select: { storeId: true },
    take: 400,
  });
  const storeIds = [...new Set(memberStores.map((m) => m.storeId))];
  const { linkedCreativeClusterCount, maxCreativeScaleScore } = await creativeOverlapForStoreIds(storeIds);

  const readyToScaleScore = computeReadyToScaleScore({
    winningScore: cluster.winningScore,
    saturationScore: cluster.saturationScore,
    storeCount: cluster.storeCount,
    linkedRawRecordCount: cluster.linkedRawRecordCount,
    lastSeenAt: cluster.lastSeenAt,
    maxCreativeScaleScore,
  });

  await prisma.productCluster.update({
    where: { id: clusterId },
    data: { readyToScaleScore, linkedCreativeClusterCount },
  });
}

export async function persistMarketLeaderForProductCluster(clusterId: string): Promise<void> {
  const cluster = await prisma.productCluster.findUnique({
    where: { id: clusterId },
    select: {
      winningScore: true,
      saturationScore: true,
      storeCount: true,
      collectionCount: true,
      linkedRawRecordCount: true,
      firstSeenAt: true,
      lastSeenAt: true,
      readyToScaleScore: true,
      linkedCreativeClusterCount: true,
    },
  });
  if (!cluster) return;

  const memberStores = await prisma.productClusterMember.findMany({
    where: { clusterId },
    select: { storeId: true },
    take: 400,
  });
  const storeIds = [...new Set(memberStores.map((m) => m.storeId))];
  const { linkedCreativeClusterCount, maxCreativeScaleScore } = await creativeOverlapForStoreIds(storeIds);

  const marketLeaderScore = computeMarketLeaderScore({
    winningScore: cluster.winningScore,
    saturationScore: cluster.saturationScore,
    storeCount: cluster.storeCount,
    collectionCount: cluster.collectionCount,
    linkedRawRecordCount: cluster.linkedRawRecordCount,
    firstSeenAt: cluster.firstSeenAt,
    lastSeenAt: cluster.lastSeenAt,
    readyToScaleScore: cluster.readyToScaleScore,
    linkedCreativeClusterCount: cluster.linkedCreativeClusterCount || linkedCreativeClusterCount,
    maxCreativeScaleScore,
  });

  await prisma.productCluster.update({
    where: { id: clusterId },
    data: { marketLeaderScore, linkedCreativeClusterCount },
  });
}

export async function persistEarlyMoverForProductCluster(clusterId: string): Promise<void> {
  const cluster = await prisma.productCluster.findUnique({
    where: { id: clusterId },
    select: {
      winningScore: true,
      readyToScaleScore: true,
      storeCount: true,
      linkedRawRecordCount: true,
      firstSeenAt: true,
      lastSeenAt: true,
      saturationScore: true,
      linkedCreativeClusterCount: true,
    },
  });
  if (!cluster) return;

  const earlyMoverScore = computeEarlyMoverScore({
    winningScore: cluster.winningScore,
    readyToScaleScore: cluster.readyToScaleScore,
    storeCount: cluster.storeCount,
    linkedRawRecordCount: cluster.linkedRawRecordCount,
    firstSeenAt: cluster.firstSeenAt,
    lastSeenAt: cluster.lastSeenAt,
    saturationScore: cluster.saturationScore,
    linkedCreativeClusterCount: cluster.linkedCreativeClusterCount,
  });

  await prisma.productCluster.update({
    where: { id: clusterId },
    data: { earlyMoverScore },
  });
}

export async function persistSaturatedForProductCluster(clusterId: string): Promise<void> {
  const cluster = await prisma.productCluster.findUnique({
    where: { id: clusterId },
    select: {
      saturationScore: true,
      marketLeaderScore: true,
      storeCount: true,
      collectionCount: true,
      linkedRawRecordCount: true,
      linkedCreativeClusterCount: true,
      firstSeenAt: true,
      lastSeenAt: true,
      readyToScaleScore: true,
    },
  });
  if (!cluster) return;

  const persistenceDays = (cluster.lastSeenAt.getTime() - cluster.firstSeenAt.getTime()) / 86400000;
  const saturatedScore = computeSaturatedScore({
    saturationScore: cluster.saturationScore,
    marketLeaderScore: cluster.marketLeaderScore,
    storeCount: cluster.storeCount,
    collectionCount: cluster.collectionCount,
    linkedRawRecordCount: cluster.linkedRawRecordCount,
    linkedCreativeClusterCount: cluster.linkedCreativeClusterCount,
    firstSeenAt: cluster.firstSeenAt,
    lastSeenAt: cluster.lastSeenAt,
    readyToScaleScore: cluster.readyToScaleScore,
    persistenceDays,
  });

  await prisma.productCluster.update({
    where: { id: clusterId },
    data: { saturatedScore },
  });
}
