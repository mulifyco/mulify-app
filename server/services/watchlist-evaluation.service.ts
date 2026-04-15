import prisma from "@/lib/prisma";
import { watchlistDb } from "@/lib/prisma-watchlist-delegate";
import type { AlertSeverity, WatchlistAlertType } from "@prisma/client";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function floatFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

export type WatchlistSnapshot = {
  watchlistId: string;
  totalStores: number;
  totalProductClusters: number;
  totalCreativeClusters: number;
  avgTrendScore: number;
  avgSaturation: number | null;
  readyToScaleCount: number;
  earlyMoverCount: number;
};

async function snapshotWatchlist(watchlistId: string): Promise<WatchlistSnapshot> {
  const wl = (await watchlistDb().findUnique({
    where: { id: watchlistId },
    include: { stores: true },
  })) as { stores: Array<{ domain: string }> } | null;
  if (!wl) throw new Error("Watchlist not found");

  const domains = wl.stores.map((s) => s.domain);
  const totalStores = wl.stores.length;
  if (!domains.length) {
    return {
      watchlistId,
      totalStores: 0,
      totalProductClusters: 0,
      totalCreativeClusters: 0,
      avgTrendScore: 0,
      avgSaturation: null,
      readyToScaleCount: 0,
      earlyMoverCount: 0,
    };
  }

  const [stores, shops] = await Promise.all([
    prisma.store.findMany({ where: { domain: { in: domains } }, select: { id: true, domain: true } }),
    prisma.shop.findMany({ where: { domain: { in: domains } }, select: { id: true, trendScore: true } }),
  ]);
  const storeIds = stores.map((s) => s.id);
  const shopIds = shops.map((s) => s.id);

  const avgTrendScore =
    shops.length > 0 ? shops.reduce((a, b) => a + (b.trendScore ?? 0), 0) / Math.max(1, shops.length) : 0;

  const [totalProductClusters, totalCreativeClusters, readyToScaleCount, earlyMoverCount] = await Promise.all([
    storeIds.length
      ? prisma.productClusterMember
          .findMany({ where: { storeId: { in: storeIds } }, select: { clusterId: true }, take: 5000 })
          .then((rows) => new Set(rows.map((r) => r.clusterId)).size)
          .catch(() => 0)
      : 0,
    shopIds.length
      ? prisma.creativeClusterMember
          .findMany({ where: { shopId: { in: shopIds } }, select: { clusterId: true }, take: 6000 })
          .then((rows) => new Set(rows.map((r) => r.clusterId)).size)
          .catch(() => 0)
      : 0,
    storeIds.length
      ? prisma.productCluster.count({
          where: { readyToScaleScore: { gt: 0 }, members: { some: { storeId: { in: storeIds } } } },
        })
      : 0,
    storeIds.length
      ? prisma.productCluster.count({
          where: { earlyMoverScore: { gt: 0 }, members: { some: { storeId: { in: storeIds } } } },
        })
      : 0,
  ]);

  return {
    watchlistId,
    totalStores,
    totalProductClusters,
    totalCreativeClusters,
    avgTrendScore: Math.round(avgTrendScore * 10) / 10,
    avgSaturation: null,
    readyToScaleCount,
    earlyMoverCount,
  };
}

function severityForTrendDelta(delta: number): AlertSeverity {
  if (delta >= 18) return "HIGH";
  if (delta >= 8) return "WARNING";
  return "INFO";
}

function severityForCountDelta(delta: number): AlertSeverity {
  if (delta >= 6) return "HIGH";
  if (delta >= 2) return "WARNING";
  return "INFO";
}

export async function evaluateWatchlistAndPersist(params: {
  watchlistId: string;
  triggeredBy?: string;
}): Promise<{ snapshot: WatchlistSnapshot; alertsWritten: number }> {
  const watchlistId = params.watchlistId;
  const wl = (await watchlistDb().findUnique({ where: { id: watchlistId }, select: { workspaceId: true } })) as {
    workspaceId: string | null;
  } | null;
  const workspaceId = wl?.workspaceId ?? null;

  const trendSpikeThreshold = floatFromEnv("WATCHLIST_TREND_SPIKE", 8);
  const countSpikeThreshold = intFromEnv("WATCHLIST_CLUSTER_SPIKE", 2);
  const dedupeWindowMin = intFromEnv("WATCHLIST_ALERT_DEDUPE_MIN", 30);
  const dedupeAfter = new Date(Date.now() - dedupeWindowMin * 60 * 1000);

  const snapshot = await snapshotWatchlist(watchlistId);
  const previous = await prisma.watchlistRun.findFirst({
    where: { watchlistId, ...(workspaceId ? { workspaceId } : {}) },
    orderBy: { createdAt: "desc" },
  });

  const prevTrend = previous?.avgTrendScore ?? 0;
  const prevPc = previous?.totalProductClusters ?? 0;
  const prevCc = previous?.totalCreativeClusters ?? 0;
  const prevRts = previous?.readyToScaleCount ?? 0;
  const prevEm = previous?.earlyMoverCount ?? 0;

  const deltaTrend = snapshot.avgTrendScore - prevTrend;
  const deltaPc = snapshot.totalProductClusters - prevPc;
  const deltaCc = snapshot.totalCreativeClusters - prevCc;

  const candidates: Array<{
    type: WatchlistAlertType;
    title: string;
    message: string;
    severity: AlertSeverity;
    delta: Record<string, unknown>;
    ruleKey: string;
  }> = [];

  if (deltaTrend > trendSpikeThreshold) {
    candidates.push({
      type: "STORE_TREND_SPIKE",
      title: "Trend spike in watchlist",
      message: `Avg trend score +${deltaTrend.toFixed(1)} (now ${snapshot.avgTrendScore}).`,
      severity: severityForTrendDelta(deltaTrend),
      delta: { avgTrendScore: snapshot.avgTrendScore, previousAvgTrendScore: prevTrend, deltaTrend },
      ruleKey: "avg_trend_spike",
    });
  }
  if (deltaPc >= countSpikeThreshold) {
    candidates.push({
      type: "PRODUCT_CLUSTER_SPIKE",
      title: "Product cluster expansion",
      message: `Linked product clusters +${deltaPc} (now ${snapshot.totalProductClusters}).`,
      severity: severityForCountDelta(deltaPc),
      delta: { totalProductClusters: snapshot.totalProductClusters, previousTotalProductClusters: prevPc, deltaPc },
      ruleKey: "product_cluster_spike",
    });
  }
  if (deltaCc >= countSpikeThreshold) {
    candidates.push({
      type: "CREATIVE_CLUSTER_SPIKE",
      title: "Creative cluster expansion",
      message: `Linked creative clusters +${deltaCc} (now ${snapshot.totalCreativeClusters}).`,
      severity: severityForCountDelta(deltaCc),
      delta: { totalCreativeClusters: snapshot.totalCreativeClusters, previousTotalCreativeClusters: prevCc, deltaCc },
      ruleKey: "creative_cluster_spike",
    });
  }
  if (snapshot.readyToScaleCount > 0 && prevRts === 0) {
    candidates.push({
      type: "READY_TO_SCALE_APPEARED",
      title: "Ready-to-scale appeared",
      message: `Ready-to-scale count is now ${snapshot.readyToScaleCount} (was 0).`,
      severity: "HIGH",
      delta: { readyToScaleCount: snapshot.readyToScaleCount, previousReadyToScaleCount: prevRts },
      ruleKey: "ready_to_scale_appeared",
    });
  }
  if (snapshot.earlyMoverCount > 0 && prevEm === 0) {
    candidates.push({
      type: "EARLY_MOVER_APPEARED",
      title: "Early mover signal appeared",
      message: `Early mover count is now ${snapshot.earlyMoverCount} (was 0).`,
      severity: "WARNING",
      delta: { earlyMoverCount: snapshot.earlyMoverCount, previousEarlyMoverCount: prevEm },
      ruleKey: "early_mover_appeared",
    });
  }

  let alertsWritten = 0;

  await prisma.$transaction(async (tx) => {
    await tx.watchlistRun.create({
      data: {
        workspaceId,
        watchlistId,
        totalStores: snapshot.totalStores,
        totalProductClusters: snapshot.totalProductClusters,
        totalCreativeClusters: snapshot.totalCreativeClusters,
        avgTrendScore: snapshot.avgTrendScore,
        avgSaturation: snapshot.avgSaturation,
        readyToScaleCount: snapshot.readyToScaleCount,
        earlyMoverCount: snapshot.earlyMoverCount,
      },
    });

    for (const a of candidates) {
      const existing = await tx.watchlistAlertLog.findFirst({
        where: {
          ...(workspaceId ? { workspaceId } : {}),
          watchlistId,
          type: a.type,
          createdAt: { gte: dedupeAfter },
          delta: { path: ["ruleKey"], equals: a.ruleKey } as never,
        },
        select: { id: true },
      });
      if (existing) continue;

      await tx.watchlistAlertLog.create({
        data: {
          workspaceId,
          watchlistId,
          type: a.type,
          title: a.title,
          message: a.message,
          severity: a.severity,
          delta: {
            ...a.delta,
            ruleKey: a.ruleKey,
            dedupeWindowMin,
            triggeredBy: params.triggeredBy ?? "worker",
          } as never,
        },
      });
      alertsWritten += 1;
    }
  });

  return { snapshot, alertsWritten };
}

