import Link from "next/link";
import EmptyState from "@/components/internal/EmptyState";
import Badge from "@/components/ui/Badge";
import CampaignBriefDrawer from "@/components/internal/CampaignBriefDrawer";
import OfferAnalyzerDrawer from "@/components/internal/OfferAnalyzerDrawer";
import PersonaAnalyzerDrawer from "@/components/internal/PersonaAnalyzerDrawer";

function asArr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

export default function ReportTopItemsSection({ type, summary }: { type: string; summary: any }) {
  if (!summary) {
    return <EmptyState title="No summary" description="This report has no snapshot payload." />;
  }

  if (type === "BOARD_SNAPSHOT") {
    const items = asArr(summary.topItems);
    if (!items.length) return <EmptyState title="No top items" description="This board snapshot contains no rows." />;
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-surface-2/30">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em]">Top items</div>
          <div className="text-sm text-muted mt-1">Highest-ranked rows captured at generation time.</div>
          {items[0]?.id ? (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <CampaignBriefDrawer
                entityType="PRODUCT_CLUSTER"
                entityId={String(items[0].id)}
                triggerLabel="Launch brief (top item)"
                title={`Brief · ${String(items[0].label ?? "Top item")}`}
              />
              <OfferAnalyzerDrawer
                entityType="PRODUCT_CLUSTER"
                entityId={String(items[0].id)}
                triggerLabel="Offer quality"
                title={`Offer audit · ${String(items[0].label ?? "Top item")}`}
              />
              <PersonaAnalyzerDrawer
                entityType="PRODUCT_CLUSTER"
                entityId={String(items[0].id)}
                triggerLabel="Persona"
                title={`Persona · ${String(items[0].label ?? "Top item")}`}
              />
              <Link
                href={`/campaign-brief?entityType=PRODUCT_CLUSTER&entityId=${encodeURIComponent(String(items[0].id))}`}
                className="text-xs text-muted hover:opacity-80"
              >
                Open page →
              </Link>
            </div>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[920px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Item</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Score</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Δ 7d RTS</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Accel</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Stores</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.slice(0, 50).map((it: any) => (
                <tr key={it.id ?? it.label} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{String(it.label ?? "—")}</div>
                    {it.id ? <div className="text-[11px] text-muted-2 font-mono mt-0.5">{String(it.id)}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{it.score != null ? Math.round(it.score) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {it.vs7dReadyToScale == null ? "—" : Number(it.vs7dReadyToScale).toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted">{String(it.trendAcceleration ?? "—")}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{it.storeCount ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted">{it.lastSeenAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (type === "COMPARE_SNAPSHOT") {
    const stores = asArr(summary.topItems);
    if (!stores.length) return <EmptyState title="No stores" description="This compare snapshot contains no stores." />;
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-surface-2/30">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em]">Stores</div>
          <div className="text-sm text-muted mt-1">Key metrics + top cluster previews.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Domain</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Trend</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">PC</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">CC</th>
                <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Top product signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stores.slice(0, 50).map((s: any) => (
                <tr key={s.domain ?? JSON.stringify(s)} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{String(s.domain ?? "—")}</div>
                    <div className="mt-1 flex gap-2 flex-wrap">
                      <Badge label={`RTS ${s.avgReadyToScaleScore ?? "—"}`} variant="default" />
                      <Badge label={`EM ${s.avgEarlyMoverScore ?? "—"}`} variant="default" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">{s.trendScore ?? 0}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{s.linkedProductClusters ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">{s.linkedCreativeClusters ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {Array.isArray(s.topProductClusters) && s.topProductClusters[0] ? (
                      <Link href={`/boards/ready-to-scale`} className="text-indigo-600 hover:opacity-80">
                        {s.topProductClusters[0]?.primaryProductTitle ?? s.topProductClusters[0]?.title ?? "Top cluster"} →
                      </Link>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (type === "WATCHLIST_SNAPSHOT") {
    const alerts = asArr(summary?.topItems?.alerts);
    return (
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-surface-2/30">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em]">Recent spikes</div>
          <div className="text-sm text-muted mt-1">Latest alert outputs captured in the snapshot.</div>
        </div>
        {alerts.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No spikes captured" description="No alert events were present at the time this snapshot was generated." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Severity</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Type</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Title</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold text-muted uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alerts.slice(0, 50).map((a: any) => (
                  <tr key={a.id ?? a.title} className="hover:bg-surface-2/50">
                    <td className="px-4 py-3 text-xs text-foreground">{String(a.severity ?? "—")}</td>
                    <td className="px-4 py-3 text-xs text-muted">{String(a.type ?? "—")}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{String(a.title ?? "—")}</td>
                    <td className="px-4 py-3 text-xs text-muted">{String(a.createdAt ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // EXECUTIVE_SUMMARY
  const worst = asArr(summary?.topItems?.worstSources);
  const jobs = asArr(summary?.topItems?.recentJobs);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-2">Worst sources</div>
        {worst.length === 0 ? (
          <div className="text-sm text-muted">—</div>
        ) : (
          <ul className="space-y-2">
            {worst.slice(0, 8).map((s: any) => (
              <li key={s.id ?? s.name} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground truncate">{s.name ?? s.id}</span>
                <span className="text-xs text-muted tabular-nums">{s.healthScore ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-2">Recent jobs</div>
        {jobs.length === 0 ? (
          <div className="text-sm text-muted">—</div>
        ) : (
          <ul className="space-y-2">
            {jobs.slice(0, 8).map((j: any) => (
              <li key={j.id ?? JSON.stringify(j)} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground truncate">{j.sourceName ?? j.sourceId ?? "Job"}</span>
                <span className="text-xs text-muted">{j.status ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

