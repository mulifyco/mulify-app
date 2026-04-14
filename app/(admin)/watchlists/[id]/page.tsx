import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import SectionHeader from "@/components/internal/SectionHeader";
import EmptyState from "@/components/internal/EmptyState";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { formatDate, timeAgo } from "@/lib/date";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import AddDomainForm from "./AddDomainForm";
import RemoveItemButton from "./RemoveItemButton";
import prisma from "@/lib/prisma";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import ActionMenu from "@/components/internal/ActionMenu";
import CreateReportButton from "@/components/internal/CreateReportButton";
import { auth } from "@/lib/auth";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export default async function WatchlistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: "" }));
  if (!workspaceId) notFound();

  let wl: Awaited<ReturnType<typeof WatchlistRepository.findById>> | null = null;
  let summary: Awaited<ReturnType<typeof WatchlistRepository.summary>> | null = null;
  let compare: Awaited<ReturnType<typeof WatchlistRepository.compare>> | null = null;
  let recentRuns: any[] = [];
  let recentAlerts: any[] = [];
  let error: string | null = null;

  try {
    [wl, summary, compare, recentRuns, recentAlerts] = await Promise.all([
      WatchlistRepository.findById(workspaceId, id),
      WatchlistRepository.summary(workspaceId, id),
      WatchlistRepository.compare(workspaceId, id),
      prisma.watchlistRun
        .findMany({ where: { watchlistId: id, workspaceId }, orderBy: { createdAt: "desc" }, take: 8 })
        .catch(() => []),
      prisma.watchlistAlertLog
        .findMany({ where: { watchlistId: id, workspaceId }, orderBy: { createdAt: "desc" }, take: 12 })
        .catch(() => []),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load watchlist.";
  }

  if (!wl && !error) notFound();
  if (error) {
    return (
      <div>
        <PageHeader title="Watchlist" description={id} />
        <QueryErrorState message={error} />
        <Link href="/watchlists" className="text-sm text-muted hover:opacity-80 mt-4 inline-block">
          ← All watchlists
        </Link>
      </div>
    );
  }

  const stores = wl?.stores ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title={wl?.name ?? "Watchlist"}
        description={wl?.description ?? `Watchlist ID · ${id}`}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/watchlists" className="text-sm text-muted hover:opacity-80">
              ← Watchlists
            </Link>
            <CreateReportButton
              label="Create report"
              variant="primary"
              payload={{ type: "WATCHLIST_SNAPSHOT", context: { watchlistId: id } }}
            />
          </div>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 text-sm">
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <div className="text-[11px] text-muted uppercase">Stores</div>
            <div className="text-xl font-semibold tabular-nums mt-1 text-foreground">{summary.totalStores}</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <div className="text-[11px] text-muted uppercase">Product clusters</div>
            <div className="text-xl font-semibold tabular-nums mt-1 text-foreground">
              {summary.totalLinkedProductClusters}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <div className="text-[11px] text-muted uppercase">Creative clusters</div>
            <div className="text-xl font-semibold tabular-nums mt-1 text-foreground">
              {summary.totalLinkedCreativeClusters}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <div className="text-[11px] text-muted uppercase">Avg trend</div>
            <div className="text-xl font-semibold tabular-nums mt-1 text-foreground">{summary.avgTrendScore}</div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <div className="text-[11px] text-muted uppercase">Latest seen</div>
            <div className="text-xs font-semibold tabular-nums mt-2 text-foreground">
              {summary.latestSeenAt ? timeAgo(summary.latestSeenAt) : "—"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <div className="text-[11px] text-muted uppercase">Updated</div>
            <div className="text-xs font-semibold tabular-nums mt-2 text-foreground">
              {wl?.updatedAt ? timeAgo(wl.updatedAt) : "—"}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <SectionHeader title="Add store/domain" description="Add competitor domains; we’ll link Store/Source when possible." />
        <AddDomainForm watchlistId={id} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader
            title="Recent alerts"
            description="Spike detection output for this watchlist (deduped, DB-only)."
          />
          {recentAlerts.length ? (
            <div className="space-y-2">
              {recentAlerts.map((a) => (
                <div key={a.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    <Badge label={a.severity} variant={a.severity === "HIGH" ? "red" : a.severity === "WARNING" ? "yellow" : "default"} />
                  </div>
                  <div className="text-xs text-muted mt-1">{a.message}</div>
                  <div className="mt-1">
                    <div className="flex items-center gap-3">
                      <ExplainDrawer
                        entityType="WATCHLIST_ALERT"
                        entityId={a.id}
                        triggerLabel="Why?"
                        title={`Watchlist spike · ${a.title}`}
                      />
                      <ActionMenu
                        ctx={{
                          entityType: "WATCHLIST_ALERT",
                          entityId: a.id,
                          watchlistId: id,
                          label: a.title,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-2 mt-1">{timeAgo(a.createdAt)}</div>
                </div>
              ))}
              <Link href="/watchlists/alerts" className="text-xs text-muted hover:opacity-80 inline-block mt-2">
                View all watchlist alerts →
              </Link>
            </div>
          ) : (
            <div className="text-sm text-muted">—</div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <SectionHeader title="Recent runs" description="Snapshot history for trend and cluster counts." />
          {recentRuns.length ? (
            <div className="rounded border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-surface-2 border-b border-border text-left">
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Created</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Stores</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">PC</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">CC</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Trend</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">RTS</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">EM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentRuns.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/60">
                      <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{formatDate(r.createdAt)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{r.totalStores}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{r.totalProductClusters}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{r.totalCreativeClusters}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{r.avgTrendScore}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{r.readyToScaleCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{r.earlyMoverCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-muted">—</div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Domain</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Label</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Linked</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Added</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stores.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted">
                  No stores in this watchlist yet.
                </td>
              </tr>
            ) : (
              stores.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2/70">
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    <a href={`https://${s.domain}`} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
                      {s.domain}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{s.label ?? "—"}</td>
                  <td className="px-3 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      {s.storeId ? <Badge label="Store" variant="green" /> : <Badge label="Store?" variant="default" />}
                      {s.sourceId ? <Badge label="Source" variant="purple" /> : <Badge label="Source?" variant="default" />}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{formatDate(s.createdAt)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <RemoveItemButton watchlistId={id} itemId={s.id} domain={s.domain} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!compare ? (
        <EmptyState title="No compare data" description="Add stores to the watchlist to see compare sections." />
      ) : (
        <div className="space-y-8">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <SectionHeader title="Stores summary" description="Best-effort rollup (Store + Shop trend when available)." />
            <div className="rounded border border-border overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead>
                  <tr className="bg-surface-2 border-b border-border text-left">
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Domain</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Trend</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Traffic</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Win prob</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Opp</th>
                    <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {compare.stores.map((s: any) => (
                    <tr key={s.id} className="hover:bg-surface-2/60">
                      <td className="px-3 py-2 font-medium text-foreground">
                        <a href={`/stores?search=${encodeURIComponent(s.domain)}`} className="hover:opacity-80">
                          {s.domain}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{s.trendScore ?? 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{s.trafficScore ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {s.winningProbabilityScore ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">{s.opportunityLevel ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted">{s.lastSeenAt ? timeAgo(s.lastSeenAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Product clusters" description="Clusters linked to watchlist stores (top winningScore)." />
              {compare.topProductClusters?.length ? (
                <ul className="space-y-2">
                  {compare.topProductClusters.map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <Link href={`/product-clusters/${c.id}`} className="text-sm font-medium text-foreground hover:opacity-80">
                        {c.title ?? c.key}
                      </Link>
                      <span className="text-xs text-muted tabular-nums">{c.winningScore}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted">—</div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Creative clusters" description="Clusters linked via Shop domain (top scaleScore)." />
              {compare.topCreativeClusters?.length ? (
                <ul className="space-y-2">
                  {compare.topCreativeClusters.map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <Link href={`/boards/creative-winners`} className="text-sm font-medium text-foreground hover:opacity-80">
                        {c.fingerprint.slice(0, 28)}
                      </Link>
                      <span className="text-xs text-muted tabular-nums">{c.scaleScore}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted">—</div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Ready to Scale" description="Watchlist-filtered ProductClusters by readyToScaleScore." />
              {compare.topReadyToScale?.length ? (
                <ul className="space-y-2">
                  {compare.topReadyToScale.map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <Link href={`/product-clusters/${c.id}`} className="text-sm font-medium text-foreground hover:opacity-80">
                        {c.title ?? c.key}
                      </Link>
                      <span className="text-xs text-muted tabular-nums">{c.readyToScaleScore}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted">—</div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Early Movers" description="Watchlist-filtered ProductClusters by earlyMoverScore." />
              {compare.topEarlyMovers?.length ? (
                <ul className="space-y-2">
                  {compare.topEarlyMovers.map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <Link href={`/product-clusters/${c.id}`} className="text-sm font-medium text-foreground hover:opacity-80">
                        {c.title ?? c.key}
                      </Link>
                      <span className="text-xs text-muted tabular-nums">{c.earlyMoverScore}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted">—</div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm lg:col-span-2">
              <SectionHeader title="Saturated" description="Watchlist-filtered ProductClusters by saturatedScore." />
              {compare.topSaturated?.length ? (
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {compare.topSaturated.map((c: any) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <Link href={`/product-clusters/${c.id}`} className="text-sm font-medium text-foreground hover:opacity-80">
                        {c.title ?? c.key}
                      </Link>
                      <span className="text-xs text-muted tabular-nums">{c.saturatedScore}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-muted">—</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

