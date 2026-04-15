import prisma from "@/src/lib/prisma";
import type { BoardType, CreativeCluster } from "@prisma/client";
import { canonicalStoreDomainForEntity } from "@/lib/intelligence/entity-identity";
import { ReadyToScaleBoardRepository } from "@/server/repositories/ready-to-scale-board.repository";
import { MarketLeadersBoardRepository } from "@/server/repositories/market-leaders-board.repository";
import { EarlyMoversBoardRepository } from "@/server/repositories/early-movers-board.repository";
import { SaturatedProductsBoardRepository } from "@/server/repositories/saturated-products-board.repository";
import { CreativeWinnersBoardRepository } from "@/server/repositories/creative-winners-board.repository";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function logWorker(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  try {
    await prisma.syncLog.create({
      data: {
        sourceId: "historical_snapshots",
        jobId: null,
        level,
        message,
        data: (data as never) ?? null,
      },
    });
  } catch {
    /* ignore */
  }
}

async function collectProductClusterIds(limit: number): Promise<string[]> {
  const chunk = Math.max(20, Math.ceil(limit / 4));
  const [rts, em, ml, sat] = await Promise.all([
    prisma.productCluster.findMany({
      orderBy: [{ readyToScaleScore: "desc" }, { lastSeenAt: "desc" }],
      take: chunk,
      select: { id: true },
    }),
    prisma.productCluster.findMany({
      orderBy: [{ earlyMoverScore: "desc" }, { lastSeenAt: "desc" }],
      take: chunk,
      select: { id: true },
    }),
    prisma.productCluster.findMany({
      orderBy: [{ marketLeaderScore: "desc" }, { lastSeenAt: "desc" }],
      take: chunk,
      select: { id: true },
    }),
    prisma.productCluster.findMany({
      orderBy: [{ saturatedScore: "desc" }, { lastSeenAt: "desc" }],
      take: chunk,
      select: { id: true },
    }),
  ]);
  const set = new Set<string>();
  for (const x of [...rts, ...em, ...ml, ...sat]) set.add(x.id);
  return [...set].slice(0, limit);
}

async function storeCreativeClusterCount(domain: string): Promise<number> {
  const shop = await prisma.shop.findUnique({ where: { domain }, select: { id: true } });
  if (!shop) return 0;
  const rows = await prisma.creativeClusterMember.groupBy({
    by: ["clusterId"],
    where: { shopId: shop.id },
    _count: { _all: true },
  });
  return rows.length;
}

async function storeProductClusterCount(storeId: string): Promise<number> {
  const rows = await prisma.productClusterMember.groupBy({
    by: ["clusterId"],
    where: { storeId },
    _count: { _all: true },
  });
  return rows.length;
}

function boardPrimaryScore(boardType: BoardType, row: { [k: string]: unknown }): number {
  switch (boardType) {
    case "READY_TO_SCALE":
      return Number(row.readyToScaleScore ?? 0);
    case "MARKET_LEADERS":
      return Number(row.marketLeaderScore ?? 0);
    case "EARLY_MOVERS":
      return Number(row.earlyMoverScore ?? 0);
    case "SATURATED_PRODUCTS":
      return Number(row.saturatedScore ?? 0);
    case "CREATIVE_WINNERS":
      return Number(row.creativeWinnerScore ?? 0);
    default:
      return 0;
  }
}

async function loadBoardItems(boardType: BoardType, take: number): Promise<Array<{ clusterId: string; [k: string]: unknown }>> {
  if (boardType === "READY_TO_SCALE") {
    const rows = await ReadyToScaleBoardRepository.list({ take, minScore: 0 });
    return rows.map((r) => ({ ...r, clusterId: r.clusterId }));
  }
  if (boardType === "MARKET_LEADERS") {
    const rows = await MarketLeadersBoardRepository.list({ take, minScore: 0 });
    return rows.map((r) => ({ ...r, clusterId: r.clusterId }));
  }
  if (boardType === "EARLY_MOVERS") {
    const rows = await EarlyMoversBoardRepository.list({ take, minScore: 0 });
    return rows.map((r) => ({ ...r, clusterId: r.clusterId }));
  }
  if (boardType === "SATURATED_PRODUCTS") {
    const rows = await SaturatedProductsBoardRepository.list({ take, minScore: 0 });
    return rows.map((r) => ({ ...r, clusterId: r.clusterId }));
  }
  if (boardType === "CREATIVE_WINNERS") {
    const rows = await CreativeWinnersBoardRepository.list({ take, minScore: 0 });
    return rows.map((r) => ({ ...r, clusterId: r.clusterId }));
  }
  return [];
}

export async function createHistoricalSnapshotsJob(): Promise<{
  day: string;
  productSnapshots: number;
  creativeSnapshots: number;
  storeSnapshots: number;
  boardSnapshots: number;
  failed: number;
}> {
  const day = utcDayStart();
  const productLimit = intFromEnv("HISTORICAL_SNAPSHOT_PRODUCT_LIMIT", 120);
  const creativeLimit = intFromEnv("HISTORICAL_SNAPSHOT_CREATIVE_LIMIT", 120);
  const storeLimit = intFromEnv("HISTORICAL_SNAPSHOT_STORE_LIMIT", 80);
  let failed = 0;

  const prevDay = new Date(day);
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);

  // ── Product clusters ─────────────────────────────────────────
  let productSnapshots = 0;
  try {
    const ids = await collectProductClusterIds(productLimit);
    const clusters = await prisma.productCluster.findMany({ where: { id: { in: ids } } });
    const prevs = await prisma.productClusterSnapshot.findMany({
      where: { productClusterId: { in: ids }, snapshotDate: prevDay },
    });
    const prevMap = new Map(prevs.map((p) => [p.productClusterId, p]));

    for (const c of clusters) {
      const prev = prevMap.get(c.id);
      const deltaReadyToScale = prev ? Number(c.readyToScaleScore) - Number(prev.readyToScaleScore) : null;
      const deltaStoreCount = prev ? c.storeCount - prev.storeCount : null;
      const deltaWinningScore = prev ? c.winningScore - prev.winningScore : null;

      await prisma.productClusterSnapshot.upsert({
        where: {
          productClusterId_snapshotDate: { productClusterId: c.id, snapshotDate: day },
        },
        create: {
          productClusterId: c.id,
          snapshotDate: day,
          winningScore: c.winningScore,
          saturationScore: c.saturationScore,
          readyToScaleScore: c.readyToScaleScore,
          marketLeaderScore: c.marketLeaderScore,
          earlyMoverScore: c.earlyMoverScore,
          saturatedScore: c.saturatedScore,
          storeCount: c.storeCount,
          creativeCount: c.linkedCreativeClusterCount,
          linkedRawRecordCount: c.linkedRawRecordCount,
          deltaReadyToScale,
          deltaStoreCount,
          deltaWinningScore,
        },
        update: {
          winningScore: c.winningScore,
          saturationScore: c.saturationScore,
          readyToScaleScore: c.readyToScaleScore,
          marketLeaderScore: c.marketLeaderScore,
          earlyMoverScore: c.earlyMoverScore,
          saturatedScore: c.saturatedScore,
          storeCount: c.storeCount,
          creativeCount: c.linkedCreativeClusterCount,
          linkedRawRecordCount: c.linkedRawRecordCount,
          deltaReadyToScale,
          deltaStoreCount,
          deltaWinningScore,
        },
      });
      productSnapshots++;
    }
  } catch (e) {
    failed++;
    await logWorker("error", "product_cluster_snapshots_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Creative clusters ─────────────────────────────────────────
  let creativeSnapshots = 0;
  try {
    const creativeRows = (await creativeClusterDb().findMany({
      orderBy: [{ creativeWinnerScore: "desc" }, { scaleScore: "desc" }, { lastSeenAt: "desc" }],
      take: creativeLimit,
    })) as CreativeCluster[];
    const cIds = creativeRows.map((c) => c.id);
    const cPrevs = await prisma.creativeClusterSnapshot.findMany({
      where: { creativeClusterId: { in: cIds }, snapshotDate: prevDay },
    });
    const cPrevMap = new Map(cPrevs.map((p) => [p.creativeClusterId, p]));

    for (const c of creativeRows) {
      const prev = cPrevMap.get(c.id);
      const deltaScaleScore = prev ? c.scaleScore - prev.scaleScore : null;
      const deltaCreativeCount = prev ? c.creativeCount - prev.creativeCount : null;

      await prisma.creativeClusterSnapshot.upsert({
        where: {
          creativeClusterId_snapshotDate: { creativeClusterId: c.id, snapshotDate: day },
        },
        create: {
          creativeClusterId: c.id,
          snapshotDate: day,
          scaleScore: c.scaleScore,
          creativeWinnerScore: c.creativeWinnerScore,
          saturationScore: c.saturationScore,
          creativeCount: c.creativeCount,
          storeCount: c.storeCount,
          productClusterCount: c.productClusterCount,
          deltaScaleScore,
          deltaCreativeCount,
        },
        update: {
          scaleScore: c.scaleScore,
          creativeWinnerScore: c.creativeWinnerScore,
          saturationScore: c.saturationScore,
          creativeCount: c.creativeCount,
          storeCount: c.storeCount,
          productClusterCount: c.productClusterCount,
          deltaScaleScore,
          deltaCreativeCount,
        },
      });
      creativeSnapshots++;
    }
  } catch (e) {
    failed++;
    await logWorker("error", "creative_cluster_snapshots_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // ── Stores ─────────────────────────────────────────
  let storeSnapshots = 0;
  try {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 60);
    const storesRaw = await prisma.store.findMany({
      where: { isActive: true, lastSeenAt: { gte: since } },
      orderBy: [{ lastSeenAt: "desc" }],
      take: Math.min(500, storeLimit * 4),
      include: { _count: { select: { products: true } } },
    });
    const byCanon = new Map<string, (typeof storesRaw)[0]>();
    for (const s of storesRaw) {
      const c = canonicalStoreDomainForEntity(s.domain) || s.domain;
      const ex = byCanon.get(c);
      if (!ex || s._count.products > ex._count.products) byCanon.set(c, s);
    }
    const stores = [...byCanon.values()]
      .sort((a, b) => (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0))
      .slice(0, storeLimit);
    const sIds = stores.map((s) => s.id);
    const sPrevs = await prisma.storeSnapshot.findMany({
      where: { storeId: { in: sIds }, snapshotDate: prevDay },
    });
    const sPrevMap = new Map(sPrevs.map((p) => [p.storeId, p]));

    for (const s of stores) {
      const [productClusterCount, creativeClusterCount] = await Promise.all([
        storeProductClusterCount(s.id),
        storeCreativeClusterCount(s.domain),
      ]);
      const prev = sPrevMap.get(s.id);
      const trafficScore = s.trafficScore ?? null;
      const winningProbabilityScore = s.winningProbabilityScore ?? null;
      const deltaTrafficScore =
        prev && trafficScore != null && prev.trafficScore != null ? trafficScore - prev.trafficScore : null;
      const deltaProductClusters = prev ? productClusterCount - prev.productClusterCount : null;

      await prisma.storeSnapshot.upsert({
        where: {
          storeId_snapshotDate: { storeId: s.id, snapshotDate: day },
        },
        create: {
          storeId: s.id,
          snapshotDate: day,
          trafficScore,
          winningProbabilityScore,
          productClusterCount,
          creativeClusterCount,
          productCount: s._count.products,
          deltaTrafficScore,
          deltaProductClusters,
        },
        update: {
          trafficScore,
          winningProbabilityScore,
          productClusterCount,
          creativeClusterCount,
          productCount: s._count.products,
          deltaTrafficScore,
          deltaProductClusters,
        },
      });
      storeSnapshots++;
    }
  } catch (e) {
    failed++;
    await logWorker("error", "store_snapshots_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  // ── Board aggregates ─────────────────────────────────────────
  let boardSnapshots = 0;
  const boardTypes: BoardType[] = [
    "READY_TO_SCALE",
    "MARKET_LEADERS",
    "EARLY_MOVERS",
    "SATURATED_PRODUCTS",
    "CREATIVE_WINNERS",
  ];
  try {
    for (const boardType of boardTypes) {
      const items = await loadBoardItems(boardType, 50);
      const scores = items.map((it) => boardPrimaryScore(boardType, it)).filter((n) => Number.isFinite(n));
      const topSlice = scores.slice(0, 10);
      const avgTopScore = topSlice.length ? topSlice.reduce((a, b) => a + b, 0) / topSlice.length : 0;
      const top = items[0];
      const topClusterId = top?.clusterId ?? null;
      const topScore = top ? boardPrimaryScore(boardType, top) : 0;

      await prisma.boardSnapshot.upsert({
        where: {
          boardType_snapshotDate: { boardType, snapshotDate: day },
        },
        create: {
          boardType,
          snapshotDate: day,
          itemCount: items.length,
          avgTopScore,
          topClusterId,
          topScore,
          metadata: {
            sampleIds: items.slice(0, 5).map((i) => i.clusterId),
          } as object,
        },
        update: {
          itemCount: items.length,
          avgTopScore,
          topClusterId,
          topScore,
          metadata: {
            sampleIds: items.slice(0, 5).map((i) => i.clusterId),
          } as object,
        },
      });
      boardSnapshots++;
    }
  } catch (e) {
    failed++;
    await logWorker("error", "board_snapshots_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  await logWorker("info", "historical_snapshots_tick", {
    day: day.toISOString(),
    productSnapshots,
    creativeSnapshots,
    storeSnapshots,
    boardSnapshots,
    failed,
  });

  return {
    day: day.toISOString(),
    productSnapshots,
    creativeSnapshots,
    storeSnapshots,
    boardSnapshots,
    failed,
  };
}
