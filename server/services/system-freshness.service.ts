import prisma from "@/lib/prisma";
import { getCachedOpsSourceHealth } from "@/lib/perf/cached-server-data";

export type SystemFreshnessPayload = {
  workerRunning: boolean;
  lastWorkerTickAt: Date | null;
  lastSuccessfulRefreshAt: Date | null;
  freshSources1h: number;
  freshSources6h: number;
  staleSources24h: number;
  newEntities24h: {
    stores: number;
    products: number;
    creatives: number;
    clusters: number;
  };
  boardCoverage: number;
  zeroInputHealth: number;
};

export async function buildSystemFreshness(): Promise<SystemFreshnessPayload> {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now - 6 * 60 * 60 * 1000);

  const [tickJob, refreshJob, fresh1h, fresh6h, stale24h, newStores, newProducts, newCreatives, newClusters, ops] =
    await Promise.all([
      prisma.scraperJob
        .findFirst({
          where: { type: "worker_tick", status: "SUCCESS" },
          orderBy: { finishedAt: "desc" },
          select: { finishedAt: true },
        })
        .catch(() => null),
      prisma.scraperJob
        .findFirst({
          where: { type: "refresh_sources", status: "SUCCESS" },
          orderBy: { finishedAt: "desc" },
          select: { finishedAt: true },
        })
        .catch(() => null),
      prisma.source.count({ where: { lastSuccessAt: { gte: oneHourAgo } } }).catch(() => 0),
      prisma.source.count({ where: { lastSuccessAt: { gte: sixHoursAgo } } }).catch(() => 0),
      prisma.source
        .count({
          where: {
            status: { in: ["ACTIVE", "PENDING"] },
            OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: dayAgo } }],
          },
        })
        .catch(() => 0),
      prisma.store.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0),
      prisma.product.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0),
      prisma.creativeCluster.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0),
      prisma.productCluster.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0),
      getCachedOpsSourceHealth().catch(() => null),
    ]);

  const lastWorkerTickAt = tickJob?.finishedAt ?? null;
  const workerRunning = lastWorkerTickAt ? now - lastWorkerTickAt.getTime() <= 3 * 60 * 1000 : false;

  const boardCoverage = ops?.summary?.boardCoverageRatioPercent ?? 0;
  const zeroInputHealth = ops?.summary?.zeroInputCoverageHealth ?? 0;

  return {
    workerRunning,
    lastWorkerTickAt,
    lastSuccessfulRefreshAt: refreshJob?.finishedAt ?? null,
    freshSources1h: fresh1h,
    freshSources6h: fresh6h,
    staleSources24h: stale24h,
    newEntities24h: {
      stores: newStores,
      products: newProducts,
      creatives: newCreatives,
      clusters: newClusters,
    },
    boardCoverage,
    zeroInputHealth,
  };
}

