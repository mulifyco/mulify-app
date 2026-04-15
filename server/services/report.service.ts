import prisma from "@/lib/prisma";
import { watchlistDb } from "@/lib/prisma-watchlist-delegate";
import { getDashboardStats } from "@/server/services/dashboard.service";
import { buildOpsSourceHealth } from "@/server/services/ops-dashboard.service";
import { compareStores } from "@/server/services/store-compare.service";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import { ReadyToScaleBoardRepository } from "@/server/repositories/ready-to-scale-board.repository";
import { MarketLeadersBoardRepository } from "@/server/repositories/market-leaders-board.repository";
import { EarlyMoversBoardRepository } from "@/server/repositories/early-movers-board.repository";
import { SaturatedProductsBoardRepository } from "@/server/repositories/saturated-products-board.repository";
import { CreativeWinnersBoardRepository } from "@/server/repositories/creative-winners-board.repository";
import { topItemsHistoricalVs7d } from "@/server/services/historical-delta.service";

export type CreateReportInput =
  | { type: "BOARD_SNAPSHOT"; context: { boardType: string; take?: number; minScore?: number; workspaceId?: string } }
  | { type: "WATCHLIST_SNAPSHOT"; context: { watchlistId: string; workspaceId?: string } }
  | { type: "COMPARE_SNAPSHOT"; context: { domains: string[]; storeIds?: string[]; workspaceId?: string } }
  | { type: "EXECUTIVE_SUMMARY"; context: { scope?: "default"; workspaceId?: string } };

function nowIso() {
  return new Date().toISOString();
}

function titleFor(input: CreateReportInput): string {
  if (input.type === "BOARD_SNAPSHOT") return `Board snapshot · ${input.context.boardType}`;
  if (input.type === "WATCHLIST_SNAPSHOT") return `Watchlist snapshot · ${input.context.watchlistId.slice(0, 8)}`;
  if (input.type === "COMPARE_SNAPSHOT") return `Compare snapshot · ${input.context.domains.slice(0, 3).join(", ") || "stores"}`;
  return "Executive summary";
}

async function boardSnapshot(boardType: string, take: number, minScore: number) {
  const t = boardType.toUpperCase();
  if (t === "READY_TO_SCALE") return { boardType: t, items: await ReadyToScaleBoardRepository.list({ take, minScore }) };
  if (t === "MARKET_LEADERS") return { boardType: t, items: await MarketLeadersBoardRepository.list({ take, minScore }) };
  if (t === "EARLY_MOVERS") return { boardType: t, items: await EarlyMoversBoardRepository.list({ take, minScore }) };
  if (t === "SATURATED_PRODUCTS") return { boardType: t, items: await SaturatedProductsBoardRepository.list({ take, minScore }) };
  if (t === "CREATIVE_WINNERS") return { boardType: t, items: await CreativeWinnersBoardRepository.list({ take, minScore }) };
  throw new Error("Invalid boardType");
}

export async function generateReportSummary(input: CreateReportInput): Promise<{
  title: string;
  sourceContext: any;
  summary: any;
}> {
  const generatedAt = nowIso();
  const title = titleFor(input);
  const workspaceId =
    typeof (input as any)?.context?.workspaceId === "string" ? String((input as any).context.workspaceId) : null;

  if (input.type === "BOARD_SNAPSHOT") {
    const take = Math.max(1, Math.min(200, input.context.take ?? 50));
    const minScore = Math.max(0, Math.min(100, input.context.minScore ?? 0));
    const snap = await boardSnapshot(input.context.boardType, take, minScore).catch(() => ({ boardType: input.context.boardType, items: [] as any[] }));
    const items = Array.isArray((snap as any).items) ? (snap as any).items : [];
    const top = items.slice(0, 25).map((r: any) => ({
      id: r.clusterId ?? r.id ?? null,
      label: r.primaryProductTitle ?? r.previewLabel ?? r.title ?? r.domain ?? r.fingerprint ?? "—",
      score:
        r.readyToScaleScore ??
        r.marketLeaderScore ??
        r.earlyMoverScore ??
        r.saturatedScore ??
        r.creativeWinnerScore ??
        null,
      storeCount: r.storeCount ?? null,
      lastSeenAt: r.lastSeenAt ? new Date(r.lastSeenAt).toISOString?.() ?? r.lastSeenAt : null,
    }));

    const bt = String((snap as { boardType?: string }).boardType ?? "");
    const productClusterBoard =
      bt === "READY_TO_SCALE" ||
      bt === "MARKET_LEADERS" ||
      bt === "EARLY_MOVERS" ||
      bt === "SATURATED_PRODUCTS";
    const clusterIds = top.map((t: { id: string | null }) => t.id).filter(Boolean) as string[];
    const histMap = productClusterBoard ? await topItemsHistoricalVs7d(clusterIds) : new Map();
    const topWithHistory = top.map((t: { id: string | null }) => {
      const h = productClusterBoard && t.id ? histMap.get(t.id) : undefined;
      return {
        ...t,
        vs7dReadyToScale: h?.readyToScaleDelta7d ?? null,
        trendAcceleration: h?.trendAcceleration ?? "unknown",
      };
    });

    const warming = topWithHistory.filter((t: { trendAcceleration: string }) => t.trendAcceleration === "up").length;

    return {
      title,
      sourceContext: { type: input.type, boardType: snap.boardType, take, minScore, generatedAt, workspaceId },
      summary: {
        generatedAt,
        cards: [
          { label: "Board", value: snap.boardType },
          { label: "Rows", value: items.length },
          { label: "Min score", value: minScore },
          { label: "Warming (7d)", value: warming },
        ],
        historical: {
          window: "7d",
          note: "vs7dReadyToScale uses daily ProductClusterSnapshot series when the historical worker has run.",
          trendAccelerationCounts: {
            up: topWithHistory.filter((t: { trendAcceleration: string }) => t.trendAcceleration === "up").length,
            down: topWithHistory.filter((t: { trendAcceleration: string }) => t.trendAcceleration === "down").length,
            flat: topWithHistory.filter((t: { trendAcceleration: string }) => t.trendAcceleration === "flat").length,
            unknown: topWithHistory.filter((t: { trendAcceleration: string }) => t.trendAcceleration === "unknown")
              .length,
          },
        },
        topItems: topWithHistory,
      },
    };
  }

  if (input.type === "WATCHLIST_SNAPSHOT") {
    const id = input.context.watchlistId;
    const wlMeta = (await watchlistDb()
      .findUnique({ where: { id }, select: { workspaceId: true } })
      .catch(() => null)) as { workspaceId: string | null } | null;
    const workspaceId = wlMeta?.workspaceId ?? null;
    const [wl, summary, compare, recentAlerts] = await Promise.all([
      workspaceId ? WatchlistRepository.findById(workspaceId, id).catch(() => null) : Promise.resolve(null),
      workspaceId ? WatchlistRepository.summary(workspaceId, id).catch(() => null) : Promise.resolve(null),
      workspaceId ? WatchlistRepository.compare(workspaceId, id).catch(() => null) : Promise.resolve(null),
      prisma.watchlistAlertLog
        .findMany({ where: { watchlistId: id, ...(workspaceId ? { workspaceId } : {}) }, orderBy: { createdAt: "desc" }, take: 12 })
        .catch(() => []),
    ]);

    const topProduct = (compare as any)?.topProductClusters ?? (compare as any)?.topProductClustersByStore ?? [];
    const topCreative = (compare as any)?.topCreativeClusters ?? (compare as any)?.topCreativeClustersByStore ?? [];

    return {
      title: wl?.name ? `Watchlist snapshot · ${wl.name}` : title,
      sourceContext: { type: input.type, watchlistId: id, generatedAt, workspaceId },
      summary: {
        generatedAt,
        cards: summary
          ? [
              { label: "Stores", value: summary.totalStores },
              { label: "Product clusters", value: summary.totalLinkedProductClusters },
              { label: "Creative clusters", value: summary.totalLinkedCreativeClusters },
              { label: "Avg trend", value: summary.avgTrendScore },
            ]
          : [{ label: "Watchlist", value: id }],
        topItems: {
          productClusters: Array.isArray(topProduct) ? topProduct.slice(0, 15) : [],
          creativeClusters: Array.isArray(topCreative) ? topCreative.slice(0, 15) : [],
          alerts: recentAlerts.map((a: any) => ({
            id: a.id,
            type: a.type,
            severity: a.severity,
            title: a.title,
            createdAt: a.createdAt?.toISOString?.() ?? String(a.createdAt),
          })),
        },
        context: {
          stores: (wl?.stores ?? []).map((s) => ({ domain: s.domain, label: s.label ?? null })),
        },
      },
    };
  }

  if (input.type === "COMPARE_SNAPSHOT") {
    const domains = (input.context.domains ?? []).map((d) => String(d)).filter(Boolean).slice(0, 20);
    const storeIds = (input.context.storeIds ?? []).map((s) => String(s)).filter(Boolean).slice(0, 20);
    const data = await compareStores({ domains, storeIds }).catch(() => null);
    const stores = data?.stores ?? [];

    return {
      title,
      sourceContext: { type: input.type, domains, storeIds, generatedAt, workspaceId },
      summary: {
        generatedAt,
        cards: [
          { label: "Stores compared", value: stores.length },
          { label: "Avg trend", value: data?.aggregates.avgTrend ?? 0 },
          { label: "Missing", value: data?.missing?.length ?? 0 },
        ],
        topItems: stores.map((s: any) => ({
          domain: s.domain,
          trendScore: s.trendScore,
          linkedProductClusters: s.linkedProductClusterCount,
          linkedCreativeClusters: s.linkedCreativeClusterCount,
          avgReadyToScaleScore: s.avgReadyToScaleScore,
          avgEarlyMoverScore: s.avgEarlyMoverScore,
          topProductClusters: (s.topProductClusters ?? []).slice(0, 5),
          topCreativeClusters: (s.topCreativeClusters ?? []).slice(0, 5),
        })),
        missing: data?.missing ?? [],
      },
    };
  }

  // EXECUTIVE_SUMMARY
  const [dash, ops] = await Promise.all([
    getDashboardStats().catch(() => null),
    buildOpsSourceHealth().catch(() => null),
  ]);

  return {
    title,
    sourceContext: { type: input.type, generatedAt, workspaceId },
    summary: {
      generatedAt,
      cards: [
        { label: "Active sources", value: dash?.activeSources ?? null },
        { label: "Failed jobs (24h)", value: dash?.failedJobs24h ?? null },
        { label: "Avg source health", value: ops?.summary.avgSourceHealthScore ?? null },
        { label: "Discovery candidates", value: ops?.summary.totalDiscoveryCandidates ?? null },
      ],
      topItems: {
        worstSources: ops?.worstSources?.slice(0, 5) ?? [],
        bestSources: ops?.bestSources?.slice(0, 5) ?? [],
        recentJobs: dash?.recentJobs ?? [],
      },
    },
  };
}

export async function createReport(input: CreateReportInput) {
  const { title, sourceContext, summary } = await generateReportSummary(input);
  const workspaceId =
    (sourceContext && typeof sourceContext === "object" && "workspaceId" in (sourceContext as any)
      ? ((sourceContext as any).workspaceId as string | null)
      : null) ?? null;
  const created = await prisma.report.create({
    data: {
      workspaceId,
      title,
      type: input.type as any,
      status: "READY" as any,
      sourceContext: sourceContext as any,
      summary: summary as any,
    } as any,
  });
  return created;
}

