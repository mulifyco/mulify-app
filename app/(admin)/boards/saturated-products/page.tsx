import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/internal/EmptyState";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { getCachedSaturatedProductsBoard } from "@/lib/perf/cached-server-data";
import { timeAgo } from "@/lib/date";
import { trackBoardViewServer } from "@/lib/analytics/track-board-server";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ take?: string; minScore?: string }>;
}

function crowdingBadgeVariant(score: number): "red" | "yellow" | "default" {
  if (score >= 65) return "red";
  if (score >= 35) return "yellow";
  return "default";
}

function saturationBadgeVariant(score: number): "yellow" | "red" | "default" {
  if (score >= 70) return "red";
  if (score >= 40) return "yellow";
  return "default";
}

export default async function SaturatedProductsBoardPage({ searchParams }: Props) {
  await trackBoardViewServer("saturated-products", "/boards/saturated-products");
  const sp = await searchParams;
  const take = Math.min(200, Math.max(1, parseInt(sp.take ?? "30", 10) || 30));
  const minScore = Math.max(0, Math.min(100, parseFloat(sp.minScore ?? "0") || 0));

  let rows: Awaited<ReturnType<typeof getCachedSaturatedProductsBoard>> = [];
  let error: string | null = null;

  try {
    rows = await getCachedSaturatedProductsBoard(take, minScore);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load board.";
  }

  return (
    <div>
      <PageHeader
        title="Saturated Products"
        description="Clusters that look crowded: many stores, repeated creatives, and long visibility. Treat as late-entry / high-competition risk."
      />

      <div className="mb-5 rounded-lg border border-amber-500/25 bg-card/80 p-4 shadow-sm ring-1 ring-amber-500/10">
        <p className="text-sm text-muted leading-relaxed max-w-3xl">
          This board is a protective lens — not a buying signal. High scores mean the idea is already everywhere. Run{" "}
          <span className="font-mono text-xs text-foreground">refresh_product_clusters</span> to refresh scores.
        </p>
        <form className="mt-4 flex flex-wrap items-end gap-3 text-sm" method="get" action="/boards/saturated-products">
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
          title="No saturated clusters in range"
          description="Raise the minimum score or run product cluster refresh so saturated scores populate."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[1020px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Product</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Saturation</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Stores</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Persistence</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Creatives</th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                  Market strength
                </th>
                <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const label = r.primaryProductTitle ?? r.title ?? "Unnamed cluster";
                const href = r.primaryProductId ? `/products/${r.primaryProductId}` : null;
                const satComposite = Math.round(r.saturatedScore * 10) / 10;
                const persistRounded = Math.round(r.persistenceDays * 10) / 10;
                return (
                  <tr key={r.clusterId} className="hover:bg-surface-2/70 transition-colors group">
                    <td className="px-3 py-2.5 align-top max-w-[280px]">
                      {href ? (
                        <Link
                          href={href}
                          className="block font-medium text-foreground group-hover:text-amber-700 dark:group-hover:text-amber-400 line-clamp-2"
                        >
                          {label}
                        </Link>
                      ) : (
                        <span className="block font-medium text-foreground line-clamp-2">{label}</span>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge
                          label={`Crowding ${satComposite.toFixed(1)}`}
                          variant={crowdingBadgeVariant(satComposite)}
                        />
                      </div>
                      <div className="text-[11px] text-muted-2 font-mono truncate mt-0.5">{r.clusterId}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top">
                      <Badge
                        label={String(r.saturationScore)}
                        variant={saturationBadgeVariant(r.saturationScore)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground align-top">{r.storeCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted align-top">
                      {persistRounded.toFixed(1)}d
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted align-top">
                      {r.linkedCreativeClusterCount}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted align-top">
                      {Math.round(r.marketLeaderScore * 10) / 10}
                    </td>
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
