import Link from "next/link";
import { getCachedDashboardStats, getCachedOpsSourceHealth } from "@/lib/perf/cached-server-data";
import PremiumMetricCard from "@/components/ui/PremiumMetricCard";
import StatCard from "@/components/ui/StatCard";
import SectionHeader from "@/components/internal/SectionHeader";
import { statusBadge } from "@/components/ui/Badge";
import { formatDate, timeAgo } from "@/lib/date";
import DashboardQuickActions from "@/components/internal/DashboardQuickActions";
import Badge from "@/components/ui/Badge";
import prisma from "@/lib/prisma";
import {
  getCachedReadyToScaleBoard,
  getCachedMarketLeadersBoard,
  getCachedEarlyMoversBoard,
  getCachedSaturatedProductsBoard,
  getCachedCreativeWinnersBoard,
} from "@/lib/perf/cached-server-data";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import ActionMenu from "@/components/internal/ActionMenu";
import CreateReportButton from "@/components/internal/CreateReportButton";
import OnboardingHelperStrip from "@/components/internal/OnboardingHelperStrip";
import { ProductEventType } from "@/lib/analytics/product-event-types";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";
import DashboardCopilotTeaser from "@/components/internal/DashboardCopilotTeaser";
import FounderCockpitStrip from "@/components/gtm/FounderCockpitStrip";
import { getGtmDashboardStatsForWorkspace } from "@/server/services/gtm.service";
import RetentionPanel from "@/components/customer-success/RetentionPanel";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { SAVED_BOARD_FILTER_ALERT_LOG_DELEGATE_KEY } from "@/lib/saved-board-filter-alert-log";
import { reviewQueueItemDb } from "@/lib/prisma-review-queue-item-delegate";
import { sourceDb } from "@/lib/prisma-source-delegate";

export const dynamic = "force-dynamic";

function metricTone(n: number, bad: boolean): "default" | "yellow" | "red" {
  if (bad && n > 0) return "red";
  return "default";
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function rowKey(r: unknown): string {
  const o = asObj(r);
  const clusterId = o?.clusterId;
  const id = o?.id;
  if (typeof clusterId === "string" && clusterId) return clusterId;
  if (typeof id === "string" && id) return id;
  return JSON.stringify(o ?? {});
}

function rowLabel(r: unknown): string {
  const o = asObj(r) ?? {};
  const previewLabel = o.previewLabel;
  const title = o.title;
  const domain = o.domain;
  const fingerprint = o.fingerprint;
  const key = o.key;
  if (typeof previewLabel === "string" && previewLabel) return previewLabel;
  if (typeof title === "string" && title) return title;
  if (typeof domain === "string" && domain) return domain;
  if (typeof fingerprint === "string" && fingerprint) return fingerprint.slice(0, 18);
  if (typeof key === "string" && key) return key;
  return "—";
}

function rowScore(r: unknown): number {
  const o = asObj(r) ?? {};
  const candidates = [
    o.readyToScaleScore,
    o.marketLeaderScore,
    o.earlyMoverScore,
    o.saturatedScore,
    o.creativeWinnerScore,
  ];
  for (const v of candidates) {
    const n = typeof v === "number" ? v : v != null ? Number(v) : 0;
    if (Number.isFinite(n) && n !== 0) return n;
  }
  return 0;
}

type BoardAlertRow = {
  id: string;
  title: string;
  message: string;
  severity: "INFO" | "WARNING" | "HIGH";
  createdAt: Date;
  savedFilter?: { id: string; name: string } | null;
};

type WatchlistAlertRow = {
  id: string;
  watchlistId: string;
  title: string;
  severity: "INFO" | "WARNING" | "HIGH";
  createdAt: Date;
  watchlist?: { name: string | null } | null;
};

type DiscoveryCandidateRow = { id: string; domain: string; discoveryScore: number; rawEvidenceCount: number };

type ReviewQueueSummaryRow = { id: string; title: string; reason: string; priority: number };

async function safeFindMany<T = unknown>(model: string, args: Record<string, unknown>): Promise<T[]> {
  try {
    const root = prisma as unknown as Record<string, unknown>;
    const m = root[model] as { findMany?: (a: Record<string, unknown>) => Promise<unknown> } | undefined;
    if (!m?.findMany) return [];
    const rows = await m.findMany(args);
    return Array.isArray(rows) ? (rows as T[]) : [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const session = await auth();
  void trackProductEventFromSession(session, {
    eventType: ProductEventType.DASHBOARD_VIEW,
    path: "/dashboard",
  });
  const plan = getUserPlan(session);
  const now = new Date();
  const dayAgo = new Date(now);
  dayAgo.setDate(dayAgo.getDate() - 1);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const userId = (session?.user as { id?: string })?.id;

  const wsCtx = await getRequiredWorkspace(session).catch(() => null);
  const gtmSnapshotPromise =
    canAccessFeature(plan, "OPS") && wsCtx?.workspaceId
      ? getGtmDashboardStatsForWorkspace(wsCtx.workspaceId).catch(() => null)
      : Promise.resolve(null);

  const [
    s,
    ops,
    recentBoardAlerts,
    recentWatchlistAlerts,
    topCandidates,
    reviewSummary,
    promotedThisWeek,
    rts,
    ml,
    em,
    sat,
    cw,
    userRow,
    gtmSnapshot,
  ] = await Promise.all([
    getCachedDashboardStats(),
    canAccessFeature(plan, "OPS") ? getCachedOpsSourceHealth().catch(() => null) : Promise.resolve(null),
    canAccessFeature(plan, "ALERTS")
      ? safeFindMany<BoardAlertRow>(SAVED_BOARD_FILTER_ALERT_LOG_DELEGATE_KEY, {
          where: { createdAt: { gte: dayAgo } },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { savedFilter: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
    canAccessFeature(plan, "ALERTS") && canAccessFeature(plan, "WATCHLISTS")
      ? safeFindMany<WatchlistAlertRow>("watchlistAlertLog", {
          where: { createdAt: { gte: dayAgo } },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { watchlist: { select: { id: true, name: true } } },
        })
      : Promise.resolve([]),
    safeFindMany<DiscoveryCandidateRow>("discoveryCandidate", {
      where: { isPromoted: false, discoveryScore: { gte: 70 } },
      orderBy: [{ discoveryScore: "desc" }, { rawEvidenceCount: "desc" }, { createdAt: "desc" }],
      take: 8,
    }),
    canAccessFeature(plan, "REVIEW_QUEUE")
      ? Promise.all([
          reviewQueueItemDb().count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
          reviewQueueItemDb().findMany({
            where: { status: { in: ["OPEN", "IN_REVIEW"] }, priority: { gte: 85 } },
            orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
            take: 5,
            select: {
              id: true,
              title: true,
              reason: true,
              priority: true,
            },
          }) as Promise<ReviewQueueSummaryRow[]>,
        ]).catch((): [number, ReviewQueueSummaryRow[]] => [0, []])
      : Promise.resolve<[number, ReviewQueueSummaryRow[]]>([0, []]),
    sourceDb()
      .count({
        where: {
          type: "SHOPIFY_DOMAIN",
          createdAt: { gte: weekAgo },
          name: { startsWith: "Discovered:" },
        },
      })
      .catch(() => 0),
    canAccessFeature(plan, "BOARDS") ? getCachedReadyToScaleBoard(3, 0).catch(() => []) : Promise.resolve([]),
    canAccessFeature(plan, "BOARDS") ? getCachedMarketLeadersBoard(3, 0).catch(() => []) : Promise.resolve([]),
    canAccessFeature(plan, "BOARDS") ? getCachedEarlyMoversBoard(3, 0).catch(() => []) : Promise.resolve([]),
    canAccessFeature(plan, "BOARDS") ? getCachedSaturatedProductsBoard(3, 0).catch(() => []) : Promise.resolve([]),
    canAccessFeature(plan, "CREATIVE_WINNERS")
      ? getCachedCreativeWinnersBoard(3, 0).catch(() => [])
      : Promise.resolve([]),
    userId
      ? prisma.user
          .findUnique({ where: { id: userId }, select: { launchDemoSeededAt: true } })
          .catch(() => null)
      : Promise.resolve(null),
    gtmSnapshotPromise,
  ]);

  const recentBoardAlertsRows = recentBoardAlerts as BoardAlertRow[];
  const recentWatchlistAlertsRows = recentWatchlistAlerts as WatchlistAlertRow[];
  const topCandidatesRows = topCandidates as DiscoveryCandidateRow[];

  type RecentJobRow = (typeof s.recentJobs)[number];
  type TopWinningHookRow = NonNullable<(typeof s)["topWinningHooks24h"]>[number];
  type CrossoverWinnerHookRow = NonNullable<(typeof s)["crossoverWinnerHooks24h"]>[number];
  type BoardPreview = { label: string; href: string; rows: unknown[] };
  type OpsWorstSourceRow = { id: string; name: string; type: string; healthScore: number; band: string };

  const bareLibrary =
    s.totalSources === 0 && s.totalStores === 0 && s.totalShops === 0 && s.totalAds === 0;
  const demoReportHref = userId ? `/reports/launch_demo_exec_${userId}` : "/reports";
  const confTotal =
    s.confidenceAds.high + s.confidenceAds.medium + s.confidenceAds.low || 1;

  const hottestBoard = (() => {
    const spots: Array<{ key: string; label: string; score: number }> = [];
    if (rts[0]) spots.push({ key: "rts", label: "Ready to Scale", score: Number(rts[0].readyToScaleScore ?? 0) });
    if (ml[0]) spots.push({ key: "ml", label: "Market Leaders", score: Number(ml[0].marketLeaderScore ?? 0) });
    if (em[0]) spots.push({ key: "em", label: "Early Movers", score: Number(em[0].earlyMoverScore ?? 0) });
    if (sat[0]) spots.push({ key: "sat", label: "Saturated Products", score: Number(sat[0].saturatedScore ?? 0) });
    if (cw[0]) spots.push({ key: "cw", label: "Creative Winners", score: Number(cw[0].creativeWinnerScore ?? 0) });
    return spots.length
      ? spots.reduce(
          (a: { key: string; label: string; score: number }, b: { key: string; label: string; score: number }) =>
            b.score > a.score ? b : a,
          spots[0]!,
        ).label
      : "—";
  })();

  const alerts24h = recentBoardAlertsRows.length;
  const watchlistSpikes24h = recentWatchlistAlertsRows.length;
  const activeBoardsWithTopItems = [rts, ml, em, sat, cw].filter((x: unknown[]) => x.length > 0).length;
  const avgHealth: number | string = ops?.summary.avgSourceHealthScore ?? "—";
  const stalled = ops?.summary.stalledSourcesCount ?? 0;
  const failedJobs24h = ops?.summary.failedJobs24h ?? s.failedJobs24h;
  const openReviewCount = reviewSummary[0] ?? 0;
  const highPriorityReviewItems: ReviewQueueSummaryRow[] = reviewSummary[1] ?? [];

  const hottest = (() => {
    if (rts[0]) return { entityType: "PRODUCT_CLUSTER", entityId: String(rts[0].clusterId), label: "Ready to Scale" };
    if (em[0]) return { entityType: "PRODUCT_CLUSTER", entityId: String(em[0].clusterId), label: "Early Movers" };
    if (ml[0]) return { entityType: "PRODUCT_CLUSTER", entityId: String(ml[0].clusterId), label: "Market Leaders" };
    if (sat[0]) return { entityType: "PRODUCT_CLUSTER", entityId: String(sat[0].clusterId), label: "Saturated" };
    if (cw[0]) return { entityType: "CREATIVE_CLUSTER", entityId: String(cw[0].clusterId), label: "Creative Winners" };
    return null;
  })();

  const hottestBoardHref = hottest
    ? hottest.label === "Ready to Scale"
      ? "/boards/ready-to-scale"
      : hottest.label === "Early Movers"
        ? "/boards/early-movers"
        : hottest.label === "Market Leaders"
          ? "/boards/market-leaders"
          : hottest.label === "Saturated"
            ? "/boards/saturated-products"
            : hottest.label === "Creative Winners"
              ? "/boards/creative-winners"
              : "/boards"
    : "/boards";

  return (
    <div className="space-y-8">
      <AdminPageShell
        title="Executive dashboard"
        description="Control room: what’s hot, what broke, and where to go next."
        actions={
          <div className="flex items-center gap-2">
            <CreateReportButton
              label="Export snapshot"
              variant="primary"
              payload={{ type: "EXECUTIVE_SUMMARY", context: { scope: "default" } }}
            />
          </div>
        }
        freshness={
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/45 glass premium-ring">
            <span
              className={[
                "h-2 w-2 rounded-full",
                s.lastSuccessfulRefreshAt ? "bg-emerald-500" : "bg-amber-500",
              ].join(" ")}
              style={{
                boxShadow: s.lastSuccessfulRefreshAt
                  ? "0 0 0 4px rgba(34,197,94,0.14)"
                  : "0 0 0 4px rgba(245,158,11,0.14)",
              }}
            />
            <span className="text-xs text-foreground font-medium">Live data</span>
            <span className="text-[11px] text-muted-2">
              {s.lastSuccessfulRefreshAt ? `refreshed ${timeAgo(s.lastSuccessfulRefreshAt)}` : "warming up"}
            </span>
          </div>
        }
      />

      <OnboardingHelperStrip
        boosted={bareLibrary}
        demoSeeded={Boolean(userRow?.launchDemoSeededAt)}
        demoReportHref={demoReportHref}
      />

      {gtmSnapshot ? (
        <FounderCockpitStrip
          demosThisWeek={gtmSnapshot.demosThisWeek}
          pipelineMRR={gtmSnapshot.pipelineMRR}
          followUpsToday={gtmSnapshot.followUpsToday}
          overdueFollowUps={gtmSnapshot.overdueFollowUps}
          trialsActive={gtmSnapshot.trialsActive}
          payingUsersApprox={gtmSnapshot.payingUsersApprox}
        />
      ) : null}

      {session ? <RetentionPanel /> : null}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {s.lastSyncAt ? (
          <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2.5 py-1 text-muted">
            <span className="text-emerald-600 dark:text-emerald-400 mr-1.5" aria-hidden>
              ●
            </span>
            Data freshness · last ingest {timeAgo(s.lastSyncAt)}
          </span>
        ) : (
          <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-muted">
            No sync recorded yet — run a source from Quick actions
          </span>
        )}
        {ops?.summary && typeof ops.summary.avgSourceHealthScore === "number" ? (
          <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-muted">
            Source health avg {Math.round(ops.summary.avgSourceHealthScore)} · stalled{" "}
            {ops.summary.stalledSourcesCount ?? 0}
          </span>
        ) : null}
        {s.sourcesInError > 0 ? (
          <Link
            href="/sources"
            className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-amber-900 dark:text-amber-200 hover:opacity-90"
          >
            {s.sourcesInError} source{s.sourcesInError === 1 ? "" : "s"} need attention →
          </Link>
        ) : null}
      </div>

      <DashboardQuickActions />

      <div>
        <SectionHeader title="Executive summary" description="High-signal snapshot across product layers" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatCard label="Boards active" value={activeBoardsWithTopItems} color="blue" sub="Top items available" />
          <StatCard label="Alerts (24h)" value={alerts24h} color={metricTone(alerts24h, true)} sub="Saved filter alerts" />
          <StatCard
            label="Watchlist spikes (24h)"
            value={watchlistSpikes24h}
            color={metricTone(watchlistSpikes24h, true)}
            sub="Competitor signals"
          />
          <StatCard label="Promoted sources (7d)" value={promotedThisWeek} color="blue" sub="Discovery → source" />
          <StatCard label="Avg source health" value={avgHealth} color="green" sub="Best-effort score" />
          <StatCard label="Hottest board" value={hottestBoard} color="yellow" sub="By #1 score" />
        </div>
        <DashboardCopilotTeaser hottest={hottest} hottestBoardHref={hottestBoardHref} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Review queue" description="Manual analyst workflow (open items)" />
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded border border-border px-3 py-2">
              <div className="text-[10px] text-muted uppercase">Open items</div>
              <div className="text-xl font-semibold tabular-nums mt-1 text-foreground">{openReviewCount}</div>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <div className="text-[10px] text-muted uppercase">High priority</div>
              <div className="text-xl font-semibold tabular-nums mt-1 text-red-600">
                {highPriorityReviewItems.length}
              </div>
            </div>
          </div>
          {highPriorityReviewItems.length ? (
            <div className="space-y-2">
              {highPriorityReviewItems.map((it: ReviewQueueSummaryRow) => (
                <div key={it.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground truncate">{it.title}</div>
                    <Badge label={String(it.priority)} variant="red" />
                  </div>
                  <div className="text-xs text-muted mt-1 truncate" title={it.reason}>
                    {it.reason}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted">—</div>
          )}
          <Link href="/review-queue" className="text-xs text-muted hover:opacity-80 inline-block mt-3">
            Open queue →
          </Link>
        </div>

        <div className="lg:col-span-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Hottest boards" description="Top 1–3 items per board (fast preview)" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { label: "Ready to Scale", href: "/boards/ready-to-scale", rows: rts },
              { label: "Market Leaders", href: "/boards/market-leaders", rows: ml },
              { label: "Early Movers", href: "/boards/early-movers", rows: em },
              { label: "Saturated Products", href: "/boards/saturated-products", rows: sat },
              { label: "Creative Winners", href: "/boards/creative-winners", rows: cw },
            ] as BoardPreview[]).map((b: BoardPreview) => (
              <div key={b.href} className="rounded border border-border bg-card px-3 py-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <Link href={b.href} className="text-sm font-semibold text-foreground hover:opacity-80">
                    {b.label}
                  </Link>
                  <Link href={b.href} className="text-xs text-muted hover:opacity-80">
                    View all →
                  </Link>
                </div>
                {b.rows.length === 0 ? (
                  <div className="text-xs text-muted-2">—</div>
                ) : (
                  <ul className="space-y-1">
                    {b.rows.map((r: unknown) => (
                      <li key={rowKey(r)} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-foreground truncate">
                          {rowLabel(r)}
                        </span>
                        <span className="text-[11px] text-muted tabular-nums">
                          {Math.round(Number(rowScore(r)))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {(() => {
                  const top = asObj(b.rows[0]);
                  const clusterId = top?.clusterId;
                  return typeof clusterId === "string" && clusterId ? (
                  <div className="mt-2">
                    <div className="flex items-center gap-3">
                      <ExplainDrawer
                        entityType={b.label === "Creative Winners" ? "CREATIVE_CLUSTER" : "PRODUCT_CLUSTER"}
                        entityId={clusterId}
                        triggerLabel="Why this top item?"
                        title={`Top item · ${b.label}`}
                      />
                      <ActionMenu
                        ctx={{
                          entityType: b.label === "Creative Winners" ? "CREATIVE_CLUSTER" : "PRODUCT_CLUSTER",
                          entityId: clusterId,
                          label: `Top item · ${b.label}`,
                        }}
                      />
                    </div>
                  </div>
                  ) : null;
                })()}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Quick navigation" description="Decision-oriented shortcuts" />
          <div className="flex flex-col gap-2 text-sm">
            <Link href="/boards" className="rounded border border-border px-3 py-2 hover:bg-surface-2">
              Open boards →
            </Link>
            <Link href="/boards/alerts" className="rounded border border-border px-3 py-2 hover:bg-surface-2">
              Board alerts →
            </Link>
            <Link href="/watchlists" className="rounded border border-border px-3 py-2 hover:bg-surface-2">
              Watchlists →
            </Link>
            <Link href="/watchlists/alerts" className="rounded border border-border px-3 py-2 hover:bg-surface-2">
              Watchlist spikes →
            </Link>
            <Link href="/sources/discovery-candidates" className="rounded border border-border px-3 py-2 hover:bg-surface-2">
              Discovery candidates →
            </Link>
            <Link href="/ops" className="rounded border border-border px-3 py-2 hover:bg-surface-2">
              Ops dashboard →
            </Link>
            <Link href="/compare" className="rounded border border-border px-3 py-2 hover:bg-surface-2">
              Compare →
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Active alerts" description="Saved filter alerts (last 24h)" />
          {recentBoardAlertsRows.length === 0 ? (
            <div className="text-sm text-muted">—</div>
          ) : (
            <div className="space-y-2">
              {recentBoardAlertsRows.map((a: BoardAlertRow) => (
                <div key={a.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    <Badge
                      label={a.severity}
                      variant={a.severity === "HIGH" ? "red" : a.severity === "WARNING" ? "yellow" : "default"}
                    />
                  </div>
                  <div className="text-xs text-muted mt-1 truncate" title={a.message}>
                    {a.message}
                  </div>
                  <div className="text-[11px] text-muted-2 mt-1">{timeAgo(a.createdAt)}</div>
                </div>
              ))}
              <Link href="/boards/alerts" className="text-xs text-muted hover:opacity-80 inline-block">
                View all →
              </Link>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Watchlist spikes" description="Competitor alerts (last 24h)" />
          {recentWatchlistAlertsRows.length === 0 ? (
            <div className="text-sm text-muted">—</div>
          ) : (
            <div className="space-y-2">
              {recentWatchlistAlertsRows.map((a: WatchlistAlertRow) => (
                <div key={a.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/watchlists/${a.watchlistId}`} className="text-sm font-medium text-foreground hover:opacity-80">
                      {a.watchlist?.name ?? "Watchlist"}
                    </Link>
                    <Badge
                      label={a.severity}
                      variant={a.severity === "HIGH" ? "red" : a.severity === "WARNING" ? "yellow" : "default"}
                    />
                  </div>
                  <div className="text-xs text-muted mt-1 truncate" title={a.title}>
                    {a.title}
                  </div>
                  <div className="text-[11px] text-muted-2 mt-1">{timeAgo(a.createdAt)}</div>
                </div>
              ))}
              <Link href="/watchlists/alerts" className="text-xs text-muted hover:opacity-80 inline-block">
                View all →
              </Link>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Discovery candidates" description="High-confidence (not promoted)" />
          {topCandidatesRows.length === 0 ? (
            <div className="text-sm text-muted">—</div>
          ) : (
            <div className="space-y-2">
              {topCandidatesRows.map((c: DiscoveryCandidateRow) => (
                <div key={c.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">{c.domain}</div>
                    <Badge label={String(c.discoveryScore)} variant="green" />
                  </div>
                  <div className="text-[11px] text-muted-2 mt-1">evidence {c.rawEvidenceCount}</div>
                </div>
              ))}
              <Link href="/sources/discovery-candidates" className="text-xs text-muted hover:opacity-80 inline-block">
                Review & promote →
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Ops preview" description="Worst sources + motor health" />
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded border border-border px-3 py-2">
              <div className="text-[10px] text-muted uppercase">Failed jobs (24h)</div>
              <div className="text-xl font-semibold tabular-nums mt-1 text-red-600">{failedJobs24h}</div>
            </div>
            <div className="rounded border border-border px-3 py-2">
              <div className="text-[10px] text-muted uppercase">Stalled</div>
              <div className="text-xl font-semibold tabular-nums mt-1 text-amber-600">{stalled}</div>
            </div>
          </div>
          {ops?.worstSources?.length ? (
            <div className="space-y-2">
              {ops.worstSources.slice(0, 3).map((src: OpsWorstSourceRow) => (
                <div key={src.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/sources/${src.id}`} className="text-sm font-medium text-foreground hover:opacity-80">
                      {src.name}
                    </Link>
                    <Badge label={String(src.healthScore)} variant={src.band === "CRITICAL" ? "red" : src.band === "WARNING" ? "yellow" : "green"} />
                  </div>
                  <div className="text-[11px] text-muted-2 mt-0.5">{src.type}</div>
                </div>
              ))}
              <Link href="/ops" className="text-xs text-muted hover:opacity-80 inline-block">
                Open ops →
              </Link>
            </div>
          ) : (
            <div className="text-sm text-muted">—</div>
          )}
        </div>

        <div className="lg:col-span-2">
          <SectionHeader title="Recent sync activity" description="Latest ingestion jobs (log-first ops)" />
          <div className="md:hidden space-y-2">
            {s.recentJobs.length === 0 ? (
              <div className="text-sm text-muted-2 text-center py-8">No jobs yet.</div>
            ) : (
              s.recentJobs.map((job: RecentJobRow) => (
                <div key={job.id} className="rounded-lg border border-border bg-card p-3 shadow-sm text-sm">
                  <div className="font-medium text-foreground">{job.sourceName}</div>
                  <div className="text-[11px] text-muted-2">{job.sourceType}</div>
                  <div className="mt-2 flex flex-wrap gap-2 items-center">{statusBadge(job.status)}</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted tabular-nums">
                    <span>F {job.totalFetched}</span>
                    <span className="text-emerald-600">N {job.totalNormalized}</span>
                    <span className="text-red-600">X {job.totalFailed}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {job.startedAt ? formatDate(job.startedAt) : timeAgo(job.createdAt)}
                  </div>
                  <Link href={`/jobs/${job.id}`} className="inline-block mt-2 text-xs text-indigo-600">
                    Log →
                  </Link>
                </div>
              ))
            )}
          </div>
          <div className="hidden md:block rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Source
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                    Fetched
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                    Norm
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                    Fail
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Started
                  </th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-muted-2 text-sm">
                      No jobs yet. Run a sync from Sources or use quick actions above.
                    </td>
                  </tr>
                ) : (
                  s.recentJobs.map((job: RecentJobRow) => (
                    <tr key={job.id} className="hover:bg-surface-2/70">
                      <td className="px-3 py-2.5">
                        <div className="text-foreground">{job.sourceName}</div>
                        <div className="text-[11px] text-muted-2">{job.sourceType}</div>
                      </td>
                      <td className="px-3 py-2.5">{statusBadge(job.status)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {job.totalFetched}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">
                        {job.totalNormalized}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-600">
                        {job.totalFailed}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {job.startedAt
                          ? formatDate(job.startedAt)
                          : timeAgo(job.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-xs text-indigo-600 hover:opacity-80"
                        >
                          Log
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Volumes" description="Normalized intelligence + local dashboard counts" />
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <PremiumMetricCard title="Fresh sources (<1h)" value={s.freshSources1h ?? 0} delta="hot" trend="up" status={(s.freshSources1h ?? 0) > 0 ? "success" : "warning"} />
          <PremiumMetricCard title="Fresh sources (<6h)" value={s.freshSources6h ?? 0} delta="warm" trend="up" status={(s.freshSources6h ?? 0) >= 3 ? "success" : "warning"} />
          <PremiumMetricCard title="Stale sources (>24h)" value={s.staleSources24h ?? 0} delta={(s.staleSources24h ?? 0) > 0 ? "needs attention" : "ok"} trend={(s.staleSources24h ?? 0) > 0 ? "up" : "flat"} status={(s.staleSources24h ?? 0) > 0 ? "warning" : "default"} />
          <PremiumMetricCard title="New stores (24h)" value={s.newStores24h ?? 0} delta="supply" trend="up" status="default" />
          <PremiumMetricCard title="New products (24h)" value={s.newProducts24h ?? 0} delta="extracted" trend="up" status="default" />
          <PremiumMetricCard title="New creatives (24h)" value={s.newCreatives24h ?? 0} delta="clusters" trend="up" status="default" />
          <PremiumMetricCard title="Sources" value={s.totalSources} delta="library" trend="flat" status="default" href="/sources" />
          <PremiumMetricCard title="Stores" value={s.totalStores} delta="graph" trend="flat" status="default" href="/stores" />
          <PremiumMetricCard title="Products" value={s.totalProducts} delta="catalog" trend="flat" status="default" href="/products" />
          <PremiumMetricCard title="Ads" value={s.totalAds} delta="creative" trend="flat" status="default" href="/ads" />
          <PremiumMetricCard title="Landing pages" value={s.totalLandingPages} delta="linked" trend="flat" status="default" href="/landing-pages" />
          <PremiumMetricCard title="Recycled domains (24h)" value={s.recycledDomains24h ?? 0} delta="feedback loop" trend="up" status={(s.recycledDomains24h ?? 0) > 0 ? "success" : "default"} />
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted uppercase tracking-wider">Winning hooks (24h)</div>
                <div className="text-sm text-foreground font-semibold mt-1">Top canonical hooks</div>
              </div>
              <div className="text-xs text-muted">
                Fastest rising angle:{" "}
                <span className="text-foreground font-medium">
                  {s.fastestRisingAngle24h ? String(s.fastestRisingAngle24h).replace(/_/g, " ") : "—"}
                </span>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {(s.topWinningHooks24h ?? []).length ? (
                (s.topWinningHooks24h ?? []).slice(0, 5).map((h: TopWinningHookRow) => (
                  <div key={h.canonicalHook} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">{h.canonicalHook}</div>
                      <div className="text-[11px] text-muted">{String(h.angleType).replace(/_/g, " ")}</div>
                    </div>
                    <div className="text-xs tabular-nums text-muted shrink-0">
                      {h.mentions} · {h.storeCount} stores
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted">No hook intel yet (wait for worker tick).</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted uppercase tracking-wider">Crossover winners</div>
            <div className="text-sm text-foreground font-semibold mt-1">Hooks winning on multiple platforms</div>
            <div className="mt-3 space-y-2">
              {(s.crossoverWinnerHooks24h ?? []).length ? (
                (s.crossoverWinnerHooks24h ?? []).slice(0, 6).map((h: CrossoverWinnerHookRow) => (
                  <div key={h.canonicalHook} className="flex items-center justify-between gap-3">
                    <div className="text-sm text-foreground truncate">{h.canonicalHook}</div>
                    <div className="text-xs tabular-nums text-muted shrink-0">{h.mentions}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted">—</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-muted uppercase tracking-wider">Live data</div>
              <div className="text-sm text-foreground font-semibold mt-1">
                {s.lastWorkerTickAt ? "Live data active" : "Live data unknown"}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap text-xs">
              <span className="px-2 py-1 rounded border border-border bg-surface-2 text-foreground">
                Last tick: {s.lastWorkerTickAt ? timeAgo(s.lastWorkerTickAt) : "—"}
              </span>
              <span className="px-2 py-1 rounded border border-border bg-surface-2 text-foreground">
                Last refresh: {s.lastSuccessfulRefreshAt ? timeAgo(s.lastSuccessfulRefreshAt) : "—"}
              </span>
              <span className="px-2 py-1 rounded border border-border bg-surface-2 text-foreground">
                Boards (24h): {s.boardsRefreshed24h ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionHeader
          title="Sync & quality signals"
          description="Failure routing for triage"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard
            label="Sources (error)"
            value={s.sourcesInError}
            color={metricTone(s.sourcesInError, true)}
          />
          <StatCard label="Running jobs" value={s.activeJobs} color="yellow" />
          <StatCard
            label="Failed jobs (24h)"
            value={s.failedJobs24h}
            color={metricTone(s.failedJobs24h, true)}
          />
          <StatCard label="Partial jobs (24h)" value={s.partialJobs24h} color="yellow" />
          <StatCard
            label="Raw failed"
            value={s.rawRecordsFailed}
            color={metricTone(s.rawRecordsFailed, true)}
          />
          <StatCard label="Raw normalized" value={s.rawRecordsNormalized} color="green" />
          <StatCard
            label="Low confidence (all)"
            value={s.entitiesLowConfidence}
            color={metricTone(s.entitiesLowConfidence, true)}
          />
          <StatCard
            label="Last sync"
            value={s.lastSyncAt ? timeAgo(s.lastSyncAt) : "—"}
          />
          <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="text-xs text-muted uppercase tracking-wider mb-2">Worker status</div>
            <div className="flex items-center gap-2">
              <Badge label={s.activeJobs > 0 ? "Running" : "Idle"} variant={s.activeJobs > 0 ? "blue" : "default"} />
              <span className="text-xs text-muted-2">Open Worker Jobs for details</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Ad confidence (tracked)" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-muted">
              <span>High</span>
              <span className="tabular-nums text-emerald-600">
                {s.confidenceAds.high}{" "}
                <span className="text-muted-2 text-xs">
                  ({Math.round((100 * s.confidenceAds.high) / confTotal)}%)
                </span>
              </span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Medium</span>
              <span className="tabular-nums text-amber-600">{s.confidenceAds.medium}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Low</span>
              <span className="tabular-nums text-red-600">{s.confidenceAds.low}</span>
            </div>
          </div>
          <Link
            href="/ads?confidenceMax=0.45"
            className="inline-block mt-4 text-xs text-indigo-600 hover:opacity-80"
          >
            Review low-scoring ads →
          </Link>
        </div>
      </div>
    </div>
  );
}
