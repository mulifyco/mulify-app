import prisma from "@/lib/prisma";
import { utcDayStart } from "@/lib/timeline/parse-range";

type ProductScoreKey = "readyToScaleScore" | "earlyMoverScore" | "marketLeaderScore";

function scoreFromProductSnapshot(
  row: {
    readyToScaleScore: number;
    earlyMoverScore: number;
    marketLeaderScore: number;
  },
  key: ProductScoreKey
): number {
  return Number(row[key] ?? 0);
}

/** Earliest vs latest snapshot in window → delta (positive = up). */
export async function batchProductClusterScoreDelta(
  clusterIds: string[],
  scoreKey: ProductScoreKey,
  days = 7
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (!clusterIds.length) return out;
  const end = new Date();
  const start = new Date(end.getTime() - (days + 1) * 86400000);
  const fromDay = utcDayStart(start);

  const rows = await prisma.productClusterSnapshot.findMany({
    where: {
      productClusterId: { in: clusterIds },
      snapshotDate: { gte: fromDay },
    },
    orderBy: [{ productClusterId: "asc" }, { snapshotDate: "asc" }],
    select: {
      productClusterId: true,
      snapshotDate: true,
      readyToScaleScore: true,
      earlyMoverScore: true,
      marketLeaderScore: true,
    },
    take: 5000,
  });

  const byCluster = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byCluster.get(r.productClusterId) ?? [];
    arr.push(r);
    byCluster.set(r.productClusterId, arr);
  }

  for (const id of clusterIds) {
    const arr = byCluster.get(id) ?? [];
    if (arr.length < 2) {
      out.set(id, null);
      continue;
    }
    const first = scoreFromProductSnapshot(arr[0]!, scoreKey);
    const last = scoreFromProductSnapshot(arr[arr.length - 1]!, scoreKey);
    out.set(id, Math.round((last - first) * 10) / 10);
  }
  return out;
}

export async function batchStoreTimelineHints(
  storeIds: string[],
  days = 7
): Promise<
  Map<
    string,
    {
      deltaTraffic: number | null;
      deltaProductClusters: number | null;
      deltaCreativeClusters: number | null;
      momentum: "up" | "down" | "flat" | "unknown";
    }
  >
> {
  const out = new Map<
    string,
    {
      deltaTraffic: number | null;
      deltaProductClusters: number | null;
      deltaCreativeClusters: number | null;
      momentum: "up" | "down" | "flat" | "unknown";
    }
  >();
  if (!storeIds.length) return out;
  const end = new Date();
  const start = new Date(end.getTime() - (days + 1) * 86400000);
  const fromDay = utcDayStart(start);

  const rows = await prisma.storeSnapshot.findMany({
    where: { storeId: { in: storeIds }, snapshotDate: { gte: fromDay } },
    orderBy: [{ storeId: "asc" }, { snapshotDate: "asc" }],
    select: {
      storeId: true,
      snapshotDate: true,
      trafficScore: true,
      productClusterCount: true,
      creativeClusterCount: true,
    },
    take: 5000,
  });

  const byStore = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byStore.get(r.storeId) ?? [];
    arr.push(r);
    byStore.set(r.storeId, arr);
  }

  for (const id of storeIds) {
    const arr = byStore.get(id) ?? [];
    if (arr.length < 2) {
      out.set(id, {
        deltaTraffic: null,
        deltaProductClusters: null,
        deltaCreativeClusters: null,
        momentum: "unknown",
      });
      continue;
    }
    const a = arr[0]!;
    const b = arr[arr.length - 1]!;
    const t0 = a.trafficScore ?? 0;
    const t1 = b.trafficScore ?? 0;
    const pc0 = a.productClusterCount;
    const pc1 = b.productClusterCount;
    const cc0 = a.creativeClusterCount;
    const cc1 = b.creativeClusterCount;
    const deltaTraffic = t1 - t0;
    const deltaProductClusters = pc1 - pc0;
    const deltaCreativeClusters = cc1 - cc0;
    const composite = deltaTraffic + deltaProductClusters * 2 + deltaCreativeClusters;
    let momentum: "up" | "down" | "flat" | "unknown" = "flat";
    if (composite > 2) momentum = "up";
    else if (composite < -2) momentum = "down";
    out.set(id, { deltaTraffic, deltaProductClusters, deltaCreativeClusters, momentum });
  }
  return out;
}

export async function topItemsHistoricalVs7d(
  clusterIds: (string | null | undefined)[]
): Promise<
  Map<
    string,
    { readyToScaleDelta7d: number | null; trendAcceleration: "up" | "down" | "flat" | "unknown" }
  >
> {
  const ids = clusterIds.filter(Boolean) as string[];
  const deltas = await batchProductClusterScoreDelta(ids, "readyToScaleScore", 7);
  const m = new Map<string, { readyToScaleDelta7d: number | null; trendAcceleration: "up" | "down" | "flat" | "unknown" }>();
  for (const id of ids) {
    const d = deltas.get(id) ?? null;
    let trendAcceleration: "up" | "down" | "flat" | "unknown" = "unknown";
    if (d == null) trendAcceleration = "unknown";
    else if (d > 1) trendAcceleration = "up";
    else if (d < -1) trendAcceleration = "down";
    else trendAcceleration = "flat";
    m.set(id, { readyToScaleDelta7d: d, trendAcceleration });
  }
  return m;
}
