import PageHeader from "@/components/ui/PageHeader";
import BoardPreviewSection from "@/components/internal/BoardPreviewSection";
import BoardPreviewItemRow from "@/components/internal/BoardPreviewItemRow";
import ProductThumbCell from "@/components/internal/ProductThumbCell";
import QueryErrorState from "@/components/internal/QueryErrorState";
import {
  getCachedReadyToScaleBoard,
  getCachedMarketLeadersBoard,
  getCachedEarlyMoversBoard,
  getCachedSaturatedProductsBoard,
  getCachedCreativeWinnersBoard,
} from "@/lib/perf/cached-server-data";
import { timeAgo } from "@/lib/date";
import { trendBadgeVariant } from "@/lib/admin/formatters";
import Link from "next/link";
import { SavedBoardFilterRepository } from "@/server/repositories/saved-board-filter.repository";
import prisma from "@/lib/prisma";
import CreateReportButton from "@/components/internal/CreateReportButton";
import EmptyState from "@/components/internal/EmptyState";
import LoadDemoWorkspaceButton from "@/components/launch/LoadDemoWorkspaceButton";
import { trackBoardViewServer } from "@/lib/analytics/track-board-server";
import { auth } from "@/lib/auth";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

const PREVIEW_TAKE = 5;
const MIN_SCORE = 0;

async function tryList<T>(fn: () => Promise<T[]>): Promise<{ rows: T[]; err: string | null }> {
  try {
    const rows = await fn();
    return { rows, err: null };
  } catch (e) {
    return { rows: [], err: e instanceof Error ? e.message : "Failed to load." };
  }
}

function crowdingBadgeVariant(score: number): "red" | "yellow" | "default" {
  if (score >= 65) return "red";
  if (score >= 35) return "yellow";
  return "default";
}

function productHref(productId: string | null): string {
  return productId ? `/products/${productId}` : "/products";
}

export default async function BoardsDashboardPage() {
  await trackBoardViewServer("overview", "/boards");
  const session = await auth();
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: "" }));
  let savedFiltersEnabled = 0;
  try {
    savedFiltersEnabled = workspaceId ? await SavedBoardFilterRepository.countEnabled(workspaceId) : 0;
  } catch {
    savedFiltersEnabled = 0;
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [activeAlertsCount, highAlertsCount] = await prisma
    .$transaction([
      prisma.boardAlertLog.count({ where: { createdAt: { gte: weekAgo }, ...(workspaceId ? { workspaceId } : {}) } }),
      prisma.boardAlertLog.count({
        where: { createdAt: { gte: weekAgo }, severity: "HIGH", ...(workspaceId ? { workspaceId } : {}) },
      }),
    ])
    .catch(() => [0, 0]);

  const [rts, ml, em, sat, cw] = await Promise.all([
    tryList(() => getCachedReadyToScaleBoard(PREVIEW_TAKE, MIN_SCORE)),
    tryList(() => getCachedMarketLeadersBoard(PREVIEW_TAKE, MIN_SCORE)),
    tryList(() => getCachedEarlyMoversBoard(PREVIEW_TAKE, MIN_SCORE)),
    tryList(() => getCachedSaturatedProductsBoard(PREVIEW_TAKE, MIN_SCORE)),
    tryList(() => getCachedCreativeWinnersBoard(PREVIEW_TAKE, MIN_SCORE)),
  ]);

  const allFailed = [rts, ml, em, sat, cw].every((b) => b.err != null);

  const totalActionable =
    rts.rows.length + ml.rows.length + em.rows.length + sat.rows.length + cw.rows.length;

  type BoardSpot = { key: string; label: string; topScore: number; topLast: number };
  const spots: BoardSpot[] = [];
  if (rts.rows[0]) {
    spots.push({
      key: "rts",
      label: "Ready to Scale",
      topScore: rts.rows[0]!.readyToScaleScore,
      topLast: rts.rows[0]!.lastSeenAt.getTime(),
    });
  }
  if (ml.rows[0]) {
    spots.push({
      key: "ml",
      label: "Market Leaders",
      topScore: ml.rows[0]!.marketLeaderScore,
      topLast: ml.rows[0]!.lastSeenAt.getTime(),
    });
  }
  if (em.rows[0]) {
    spots.push({
      key: "em",
      label: "Early Movers",
      topScore: em.rows[0]!.earlyMoverScore,
      topLast: em.rows[0]!.lastSeenAt.getTime(),
    });
  }
  if (sat.rows[0]) {
    spots.push({
      key: "sat",
      label: "Saturated Products",
      topScore: sat.rows[0]!.saturatedScore,
      topLast: sat.rows[0]!.lastSeenAt.getTime(),
    });
  }
  if (cw.rows[0]) {
    spots.push({
      key: "cw",
      label: "Creative Winners",
      topScore: cw.rows[0]!.creativeWinnerScore,
      topLast: cw.rows[0]!.lastSeenAt.getTime(),
    });
  }

  const hottest =
    spots.length > 0
      ? spots.reduce((a, b) => (b.topScore > a.topScore ? b : a), spots[0]!).label
      : "—";
  const freshest =
    spots.length > 0
      ? spots.reduce((a, b) => (b.topLast > a.topLast ? b : a), spots[0]!).label
      : "—";

  return (
    <div>
      <PageHeader
        title="Boards"
        description="Executive view across intelligence boards — where to start, what’s hot, and what’s still moving."
      />

      {allFailed ? (
        <QueryErrorState message="Could not load board previews. Check the database and try again." />
      ) : null}

      {!allFailed && totalActionable === 0 ? (
        <div className="mb-8">
          <EmptyState
            title="Boards are still warming up"
            description="After sources sync and cluster workers run, Ready to Scale, Market Leaders, and related boards populate automatically. Check ops if jobs stall."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <LoadDemoWorkspaceButton label="Load sample workspace" />
                <Link
                  href="/sources"
                  className="rounded-lg border border-border bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
                >
                  Manage sources
                </Link>
                <Link
                  href="/ops"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
                >
                  Ops health
                </Link>
              </div>
            }
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">
            Board categories
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1 text-foreground">5</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">
            Items in preview
          </div>
          <div className="text-2xl font-semibold tabular-nums mt-1 text-foreground">{totalActionable}</div>
          <div className="text-[11px] text-muted-2 mt-0.5">Top {PREVIEW_TAKE} per board (best-effort)</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">Hottest board</div>
          <div className="text-sm font-semibold mt-1.5 text-foreground leading-snug">{hottest}</div>
          <div className="text-[11px] text-muted-2 mt-0.5">By #1 row score</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">Freshest board</div>
          <div className="text-sm font-semibold mt-1.5 text-foreground leading-snug">{freshest}</div>
          <div className="text-[11px] text-muted-2 mt-0.5">By #1 row last seen</div>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-surface-2/30 px-4 py-2.5 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-muted">
            Saved filters active:{" "}
            <span className="font-semibold tabular-nums text-foreground">{savedFiltersEnabled}</span>
          </span>
          <span className="text-muted">
            Alerts (7d): <span className="font-semibold tabular-nums text-foreground">{activeAlertsCount}</span>
          </span>
          <span className="text-muted">
            High: <span className="font-semibold tabular-nums text-red-600">{highAlertsCount}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <CreateReportButton
            label="Create report"
            variant="primary"
            payload={{ type: "EXECUTIVE_SUMMARY", context: { scope: "default" } }}
          />
          <Link href="/boards/alerts" className="text-xs font-medium text-muted hover:opacity-80">
            View alerts →
          </Link>
          <Link
            href="/boards/saved-filters"
            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:opacity-80"
          >
            Manage rules →
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        <BoardPreviewSection
          title="Ready to Scale"
          description="Balanced upside: winning demand, creative scale, without extreme saturation."
          viewAllHref="/boards/ready-to-scale"
        >
          {rts.err ? (
            <div className="px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{rts.err}</div>
          ) : rts.rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              No clusters yet — run <span className="font-mono text-xs">refresh_product_clusters</span>.
            </div>
          ) : (
            rts.rows.map((r) => {
              const label = r.primaryProductTitle ?? r.title ?? "Unnamed cluster";
              const score = Math.round(r.readyToScaleScore * 10) / 10;
              return (
                <BoardPreviewItemRow
                  key={r.clusterId}
                  href={productHref(r.primaryProductId)}
                  title={label}
                  subtitle={r.clusterId}
                  scoreLabel="Ready"
                  scoreValue={score.toFixed(1)}
                  scoreVariant={trendBadgeVariant(score)}
                  meta={[
                    `${r.storeCount} stores`,
                    `${r.linkedCreativeClusterCount} creative`,
                    timeAgo(r.lastSeenAt),
                  ]}
                />
              );
            })
          )}
        </BoardPreviewSection>

        <BoardPreviewSection
          title="Market Leaders"
          description="Proven distribution and staying power — the clusters shaping the market."
          viewAllHref="/boards/market-leaders"
        >
          {ml.err ? (
            <div className="px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{ml.err}</div>
          ) : ml.rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              No clusters yet — run <span className="font-mono text-xs">refresh_product_clusters</span>.
            </div>
          ) : (
            ml.rows.map((r) => {
              const label = r.primaryProductTitle ?? r.title ?? "Unnamed cluster";
              const score = Math.round(r.marketLeaderScore * 10) / 10;
              return (
                <BoardPreviewItemRow
                  key={r.clusterId}
                  href={productHref(r.primaryProductId)}
                  title={label}
                  subtitle={r.clusterId}
                  scoreLabel="Leader"
                  scoreValue={score.toFixed(1)}
                  scoreVariant={trendBadgeVariant(score)}
                  meta={[
                    `${r.storeCount} stores`,
                    `${r.collectionCount} coll.`,
                    timeAgo(r.lastSeenAt),
                  ]}
                />
              );
            })
          )}
        </BoardPreviewSection>

        <BoardPreviewSection
          title="Early Movers"
          description="Fresh clusters accelerating before saturation — speed over scale."
          viewAllHref="/boards/early-movers"
        >
          {em.err ? (
            <div className="px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{em.err}</div>
          ) : em.rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              No clusters yet — run <span className="font-mono text-xs">refresh_product_clusters</span>.
            </div>
          ) : (
            em.rows.map((r) => {
              const label = r.primaryProductTitle ?? r.title ?? "Unnamed cluster";
              const score = Math.round(r.earlyMoverScore * 10) / 10;
              return (
                <BoardPreviewItemRow
                  key={r.clusterId}
                  href={productHref(r.primaryProductId)}
                  title={label}
                  subtitle={r.clusterId}
                  scoreLabel="Early"
                  scoreValue={score.toFixed(1)}
                  scoreVariant={trendBadgeVariant(score)}
                  meta={[
                    `${r.storeCount} stores`,
                    `sat ${r.saturationScore}`,
                    timeAgo(r.lastSeenAt),
                  ]}
                />
              );
            })
          )}
        </BoardPreviewSection>

        <BoardPreviewSection
          title="Saturated Products"
          description="Crowded / late-entry risk — many stores, creatives, and long visibility."
          viewAllHref="/boards/saturated-products"
        >
          {sat.err ? (
            <div className="px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{sat.err}</div>
          ) : sat.rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              No clusters yet — run <span className="font-mono text-xs">refresh_product_clusters</span>.
            </div>
          ) : (
            sat.rows.map((r) => {
              const label = r.primaryProductTitle ?? r.title ?? "Unnamed cluster";
              const score = Math.round(r.saturatedScore * 10) / 10;
              const persist = Math.round(r.persistenceDays * 10) / 10;
              return (
                <BoardPreviewItemRow
                  key={r.clusterId}
                  href={productHref(r.primaryProductId)}
                  title={label}
                  subtitle={r.clusterId}
                  scoreLabel="Crowding"
                  scoreValue={score.toFixed(1)}
                  scoreVariant={crowdingBadgeVariant(score)}
                  meta={[
                    `${r.storeCount} stores`,
                    `${persist.toFixed(0)}d span`,
                    timeAgo(r.lastSeenAt),
                  ]}
                />
              );
            })
          )}
        </BoardPreviewSection>

        <BoardPreviewSection
          title="Creative Winners"
          description="Strongest creative clusters by scale, repetition, and cross-store reach."
          viewAllHref="/boards/creative-winners"
        >
          {cw.err ? (
            <div className="px-4 py-3 text-sm text-amber-700 dark:text-amber-400">{cw.err}</div>
          ) : cw.rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted">
              No clusters yet — run <span className="font-mono text-xs">refresh_creative_clusters</span>.
            </div>
          ) : (
            cw.rows.map((r) => {
              const score = Math.round(r.creativeWinnerScore * 10) / 10;
              const href = `/ads?creativeClusterId=${encodeURIComponent(r.clusterId)}`;
              return (
                <BoardPreviewItemRow
                  key={r.clusterId}
                  href={href}
                  title={r.previewLabel}
                  subtitle={r.fingerprint}
                  scoreLabel="Winner"
                  scoreValue={score.toFixed(1)}
                  scoreVariant={trendBadgeVariant(score)}
                  meta={[
                    `${r.storeCount} stores`,
                    `${r.creativeCount} ads`,
                    timeAgo(r.lastSeenAt),
                  ]}
                  leading={<ProductThumbCell src={r.previewUrl} title={r.previewLabel} />}
                />
              );
            })
          )}
        </BoardPreviewSection>
      </div>
    </div>
  );
}
