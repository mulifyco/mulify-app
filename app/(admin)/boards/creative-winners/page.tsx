import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/internal/EmptyState";
import QueryErrorState from "@/components/internal/QueryErrorState";
import ProductThumbCell from "@/components/internal/ProductThumbCell";
import { getCachedCreativeWinnersBoard } from "@/lib/perf/cached-server-data";
import { timeAgo } from "@/lib/date";
import { trendBadgeVariant } from "@/lib/admin/formatters";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import ActionMenu from "@/components/internal/ActionMenu";
import PaywallPanel from "@/components/internal/PaywallPanel";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";
import { trackBoardViewServer } from "@/lib/analytics/track-board-server";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ take?: string; minScore?: string }>;
}

export default async function CreativeWinnersBoardPage({ searchParams }: Props) {
  const session = await auth();
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "CREATIVE_WINNERS")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Creative Winners"
          description="Creative clusters with the strongest scale signals — many stores, repeated use, and durable activity."
        />
        <PaywallPanel
          feature="CREATIVE_WINNERS"
          currentPlan={plan}
          title="Creative Winners is a Pro feature"
          description="Upgrade to unlock the full creative intelligence board and related actions."
        />
      </div>
    );
  }

  await trackBoardViewServer("creative-winners", "/boards/creative-winners");
  const sp = await searchParams;
  const take = Math.min(200, Math.max(1, parseInt(sp.take ?? "30", 10) || 30));
  const minScore = Math.max(0, Math.min(100, parseFloat(sp.minScore ?? "0") || 0));

  let rows: Awaited<ReturnType<typeof getCachedCreativeWinnersBoard>> = [];
  let error: string | null = null;

  try {
    rows = await getCachedCreativeWinnersBoard(take, minScore);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load board.";
  }

  return (
    <div>
      <PageHeader
        title="Creative Winners"
        description="Creative clusters with the strongest scale signals — many stores, repeated use, and durable activity. Click through to see the ads behind each cluster."
      />

      <div className="mb-5 rounded-lg border border-border bg-card/80 p-4 shadow-sm">
        <p className="text-sm text-muted leading-relaxed max-w-3xl">
          Ranks normalized Meta creatives by cross-store reach, repetition, product linkage, and longevity. Run{" "}
          <span className="font-mono text-xs text-foreground">refresh_creative_clusters</span> to refresh scores.
        </p>
        <form className="mt-4 flex flex-wrap items-end gap-3 text-sm" method="get" action="/boards/creative-winners">
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
          title="No creative clusters in range"
          description="Lower the minimum score or run creative cluster refresh so winner scores populate."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[1040px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase w-14">Preview</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Creative</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                  Winner score
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Scale</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Stores</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Products</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Confidence</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const adsHref = `/ads?creativeClusterId=${encodeURIComponent(r.clusterId)}`;
                const winner = Math.round(r.creativeWinnerScore * 10) / 10;
                const confPct = Math.round(r.confidence * 100);
                return (
                  <tr key={r.clusterId} className="hover:bg-surface-2/70 transition-colors group">
                    <td className="px-3 py-2.5 align-middle">
                      <Link href={adsHref} className="block shrink-0 opacity-90 group-hover:opacity-100">
                        <ProductThumbCell src={r.previewUrl} title={r.previewLabel} />
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 align-top max-w-[300px]">
                      <Link
                        href={adsHref}
                        className="block font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-2"
                      >
                        {r.previewLabel}
                      </Link>
                      <div className="text-[11px] text-muted mt-0.5">{String(r.platform)}</div>
                      <div className="text-[11px] text-muted-2 font-mono truncate mt-0.5">{r.fingerprint}</div>
                      <div className="mt-1">
                        <div className="flex items-center gap-3">
                          <ExplainDrawer
                            entityType="CREATIVE_CLUSTER"
                            entityId={r.clusterId}
                            triggerLabel="Why?"
                            title={`Creative Winners · ${r.previewLabel}`}
                          />
                          <ActionMenu
                            ctx={{
                              entityType: "CREATIVE_CLUSTER",
                              entityId: r.clusterId,
                              label: r.previewLabel,
                              boardType: "CREATIVE_WINNERS",
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <Link
                          href={`/creative-clusters/${r.clusterId}`}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:opacity-80 inline-block"
                        >
                          Timeline →
                        </Link>
                        {r.sampleAdId ? (
                          <Link
                            href={`/ads/${r.sampleAdId}`}
                            className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:opacity-80 inline-block"
                          >
                            Sample ad →
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top">
                      <Badge label={winner.toFixed(1)} variant={trendBadgeVariant(winner)} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground align-top">
                      {r.scaleScore}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted align-top">{r.storeCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted align-top">
                      {r.productClusterCount}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted align-top">{confPct}%</td>
                    <td className="px-3 py-2.5 text-xs text-muted align-top whitespace-nowrap">
                      {timeAgo(r.lastSeenAt)}
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
