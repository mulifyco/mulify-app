import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/internal/EmptyState";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { getCachedMarketLeadersBoard } from "@/lib/perf/cached-server-data";
import { timeAgo } from "@/lib/date";
import { trendBadgeVariant } from "@/lib/admin/formatters";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import ActionMenu from "@/components/internal/ActionMenu";
import BoardDeltaBadge from "@/components/internal/BoardDeltaBadge";
import { batchProductClusterScoreDelta } from "@/server/services/historical-delta.service";
import { trackBoardViewServer } from "@/lib/analytics/track-board-server";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ take?: string; minScore?: string }>;
}

export default async function MarketLeadersBoardPage({ searchParams }: Props) {
  await trackBoardViewServer("market-leaders", "/boards/market-leaders");
  const sp = await searchParams;
  const take = Math.min(200, Math.max(1, parseInt(sp.take ?? "30", 10) || 30));
  const minScore = Math.max(0, Math.min(100, parseFloat(sp.minScore ?? "0") || 0));

  let rows: Awaited<ReturnType<typeof getCachedMarketLeadersBoard>> = [];
  let error: string | null = null;

  try {
    rows = await getCachedMarketLeadersBoard(take, minScore);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load board.";
  }

  const deltas7d =
    rows.length > 0
      ? await batchProductClusterScoreDelta(
          rows.map((r) => r.clusterId),
          "marketLeaderScore",
          7
        )
      : new Map<string, number | null>();

  return (
    <div>
      <PageHeader
        title="Market Leaders"
        description="Product clusters with proven distribution, creative scale, and staying power — the ones shaping the market."
      />

      <div className="mb-5 rounded-lg border border-border bg-card/80 p-4 shadow-sm">
        <p className="text-sm text-muted leading-relaxed max-w-3xl">
          Emphasizes multi-store reach, linked creatives, and persistence. Run{" "}
          <span className="font-mono text-xs text-foreground">refresh_product_clusters</span> to refresh scores.
        </p>
        <form className="mt-4 flex flex-wrap items-end gap-3 text-sm" method="get" action="/boards/market-leaders">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted uppercase tracking-wide">Rows</span>
            <input
              type="number"
              name="take"
              min={1}
              max={200}
              defaultValue={take}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 w-24 text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium text-muted uppercase tracking-wide">Min score</span>
            <input
              type="number"
              name="minScore"
              min={0}
              max={100}
              step={1}
              defaultValue={minScore}
              className="rounded-md border border-border bg-background px-2.5 py-1.5 w-24 text-foreground"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-semibold hover:opacity-90"
          >
            Apply
          </button>
        </form>
      </div>

      {error ? (
        <QueryErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No clusters in range"
          description="Lower the minimum score or run product cluster refresh so market leader scores populate."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Product</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                  Leader score
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">7d Δ</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Stores</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Saturation</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Winning</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Last seen</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const label = r.primaryProductTitle ?? r.title ?? "Unnamed cluster";
                const href = r.primaryProductId ? `/products/${r.primaryProductId}` : null;
                const leader = Math.round(r.marketLeaderScore * 10) / 10;
                return (
                  <tr key={r.clusterId} className="hover:bg-surface-2/70 transition-colors group">
                    <td className="px-3 py-2.5 align-top max-w-[280px]">
                      {href ? (
                        <Link
                          href={href}
                          className="block font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-2"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="block font-medium text-foreground line-clamp-2">{label}</span>
                      )}
                      <div className="text-[11px] text-muted-2 font-mono truncate mt-0.5">{r.clusterId}</div>
                      <div className="mt-1">
                        <div className="flex items-center gap-3">
                          <ExplainDrawer
                            entityType="PRODUCT_CLUSTER"
                            entityId={r.clusterId}
                            triggerLabel="Why?"
                            title={`Market Leaders · ${label}`}
                          />
                          <ActionMenu
                            ctx={{
                              entityType: "PRODUCT_CLUSTER",
                              entityId: r.clusterId,
                              domain: (r as any).primaryDomain ?? (r as any).domain ?? undefined,
                              label,
                              boardType: "MARKET_LEADERS",
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top">
                      <Badge label={leader.toFixed(1)} variant={trendBadgeVariant(leader)} />
                    </td>
                    <td className="px-3 py-2.5 text-right align-top">
                      <BoardDeltaBadge delta={deltas7d.get(r.clusterId) ?? null} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground align-top">{r.storeCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted align-top">{r.saturationScore}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted align-top">{r.winningScore}</td>
                    <td className="px-3 py-2.5 text-xs text-muted align-top whitespace-nowrap">
                      {timeAgo(r.lastSeenAt)}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {r.linkedCreativeClusterCount > 0 && (
                          <Badge label={`${r.linkedCreativeClusterCount} creative`} variant="blue" />
                        )}
                        {r.linkedRawRecordCount > 0 && (
                          <Badge label={`${r.linkedRawRecordCount} links`} variant="default" />
                        )}
                        {r.collectionCount > 0 && (
                          <Badge label={`${r.collectionCount} coll.`} variant="default" />
                        )}
                        {r.linkedCreativeClusterCount === 0 &&
                          r.linkedRawRecordCount === 0 &&
                          r.collectionCount === 0 && <span className="text-muted-2 text-xs">—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
