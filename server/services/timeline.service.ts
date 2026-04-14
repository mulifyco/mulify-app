import prisma from "@/lib/prisma";
import { utcDayStart } from "@/lib/timeline/parse-range";
import type { TimelineRangeParsed } from "@/lib/timeline/parse-range";

export async function resolveProductTimelineClusterId(id: string): Promise<string | null> {
  const asCluster = await prisma.productCluster.findUnique({ where: { id }, select: { id: true } });
  if (asCluster) return asCluster.id;
  const member = await prisma.productClusterMember.findUnique({
    where: { productId: id },
    select: { clusterId: true },
  });
  return member?.clusterId ?? null;
}

export async function resolveCreativeTimelineClusterId(id: string): Promise<string | null> {
  const asCluster = await prisma.creativeCluster.findUnique({ where: { id }, select: { id: true } });
  if (asCluster) return asCluster.id;
  const member = await prisma.creativeClusterMember.findUnique({
    where: { adId: id },
    select: { clusterId: true },
  });
  return member?.clusterId ?? null;
}

export async function getProductClusterTimeline(clusterId: string, range: TimelineRangeParsed) {
  const fromDay = utcDayStart(range.from);
  const toDay = utcDayStart(range.to);

  const rows = await prisma.productClusterSnapshot.findMany({
    where: {
      productClusterId: clusterId,
      snapshotDate: { gte: fromDay, lte: toDay },
    },
    orderBy: { snapshotDate: "asc" },
    take: 120,
  });

  return {
    entityType: "PRODUCT_CLUSTER" as const,
    entityId: clusterId,
    range: range.rangeKey,
    points: rows.map((r) => ({
      snapshotDate: r.snapshotDate.toISOString(),
      winningScore: r.winningScore,
      saturationScore: r.saturationScore,
      readyToScaleScore: r.readyToScaleScore,
      marketLeaderScore: r.marketLeaderScore,
      earlyMoverScore: r.earlyMoverScore,
      saturatedScore: r.saturatedScore,
      storeCount: r.storeCount,
      creativeCount: r.creativeCount,
      linkedRawRecordCount: r.linkedRawRecordCount,
      deltaReadyToScale: r.deltaReadyToScale,
      deltaStoreCount: r.deltaStoreCount,
      deltaWinningScore: r.deltaWinningScore,
    })),
  };
}

export async function getCreativeClusterTimeline(clusterId: string, range: TimelineRangeParsed) {
  const fromDay = utcDayStart(range.from);
  const toDay = utcDayStart(range.to);

  const rows = await prisma.creativeClusterSnapshot.findMany({
    where: {
      creativeClusterId: clusterId,
      snapshotDate: { gte: fromDay, lte: toDay },
    },
    orderBy: { snapshotDate: "asc" },
    take: 120,
  });

  return {
    entityType: "CREATIVE_CLUSTER" as const,
    entityId: clusterId,
    range: range.rangeKey,
    points: rows.map((r) => ({
      snapshotDate: r.snapshotDate.toISOString(),
      scaleScore: r.scaleScore,
      creativeWinnerScore: r.creativeWinnerScore,
      saturationScore: r.saturationScore,
      creativeCount: r.creativeCount,
      storeCount: r.storeCount,
      productClusterCount: r.productClusterCount,
      deltaScaleScore: r.deltaScaleScore,
      deltaCreativeCount: r.deltaCreativeCount,
    })),
  };
}

export async function getStoreTimeline(storeId: string, range: TimelineRangeParsed) {
  const fromDay = utcDayStart(range.from);
  const toDay = utcDayStart(range.to);

  const rows = await prisma.storeSnapshot.findMany({
    where: {
      storeId,
      snapshotDate: { gte: fromDay, lte: toDay },
    },
    orderBy: { snapshotDate: "asc" },
    take: 120,
  });

  return {
    entityType: "STORE" as const,
    entityId: storeId,
    range: range.rangeKey,
    points: rows.map((r) => ({
      snapshotDate: r.snapshotDate.toISOString(),
      trafficScore: r.trafficScore,
      winningProbabilityScore: r.winningProbabilityScore,
      productClusterCount: r.productClusterCount,
      creativeClusterCount: r.creativeClusterCount,
      productCount: r.productCount,
      deltaTrafficScore: r.deltaTrafficScore,
      deltaProductClusters: r.deltaProductClusters,
    })),
  };
}
