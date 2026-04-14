import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import Badge from "@/components/ui/Badge";
import Pagination from "@/components/ui/Pagination";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { formatDate } from "@/lib/date";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import ActionMenu from "@/components/internal/ActionMenu";
import CopilotDrawer from "@/components/internal/CopilotDrawer";
import AutoActionsBar from "@/components/internal/AutoActionsBar";
import AddAsLeadButton from "@/components/internal/AddAsLeadButton";
import PaywallPanel from "@/components/internal/PaywallPanel";
import EmptyState from "@/components/internal/EmptyState";
import { ProductEventType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";
import type { Prisma } from "@prisma/client";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";

export const dynamic = "force-dynamic";

type WatchlistAlertRow = Prisma.WatchlistAlertLogGetPayload<{
  include: { watchlist: { select: { id: true; name: true } } };
}>;

function sevVariant(s: string): "red" | "yellow" | "default" {
  if (s === "HIGH") return "red";
  if (s === "WARNING") return "yellow";
  return "default";
}

export default async function WatchlistAlertsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await auth();
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "ALERTS") || !canAccessFeature(plan, "WATCHLISTS")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Watchlist alerts" description="Competitor spike and movement alerts." />
        <PaywallPanel
          feature="ALERTS"
          currentPlan={plan}
          title="Watchlist alerts are a Pro feature"
          description="Upgrade to capture trend spikes, cluster deltas, and competitor movement in a dedicated alert log."
        />
      </div>
    );
  }

  void trackProductEventFromSession(session, {
    eventType: ProductEventType.WATCHLIST_ALERT_OPEN,
    path: "/watchlists/alerts",
  });

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  let items: WatchlistAlertRow[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const [rows, cnt] = await Promise.all([
      prisma.watchlistAlertLog.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { watchlist: { select: { id: true, name: true } } },
      }),
      prisma.watchlistAlertLog.count(),
    ]);
    items = rows;
    total = cnt;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load watchlist alerts.";
  }

  return (
    <div>
      <PageHeader
        title="Watchlist alerts"
        description="Spike detection alerts across all watchlists."
        action={
          <Link href="/watchlists" className="text-sm text-muted hover:opacity-80">
            ← Watchlists
          </Link>
        }
      />

      {error ? (
        <QueryErrorState message={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No watchlist alerts yet"
          description="When evaluations detect spikes or movement on tracked domains, events land here for weekly reviews and client-ready narratives."
          action={
            <Link
              href="/watchlists"
              className="rounded-lg border border-border bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              Open watchlists
            </Link>
          }
        />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[1080px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Created</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Watchlist</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Severity</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Title</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-2/70">
                      <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{formatDate(a.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <Link href={`/watchlists/${a.watchlistId}`} className="text-sm font-medium text-foreground hover:opacity-80">
                          {a.watchlist?.name ?? a.watchlistId}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">{a.type}</td>
                      <td className="px-3 py-2.5">
                        <Badge label={a.severity} variant={sevVariant(a.severity)} />
                      </td>
                      <td className="px-3 py-2.5 text-sm text-foreground">{a.title}</td>
                      <td className="px-3 py-2.5 text-xs text-muted max-w-[520px] truncate" title={a.message}>
                        {a.message}
                        <div className="mt-1">
                          <div className="flex items-center gap-3">
                            <AutoActionsBar
                              compact
                              entityType="WATCHLIST_ALERT"
                              entityId={a.id}
                              actions={[
                                { label: "Compare", actionType: "OPEN_COMPARE" },
                                { label: "Report", actionType: "CREATE_REPORT" },
                              ]}
                            />
                            <AddAsLeadButton
                              domain={
                                typeof a.delta === "object" && a.delta !== null && "domain" in a.delta
                                  ? String((a.delta as { domain?: unknown }).domain ?? "")
                                  : ""
                              }
                              tags={["from_watchlist_spike", "acquisition_target"]}
                            />
                            <Link href="/boards/ready-to-scale" className="text-xs text-indigo-600 hover:opacity-80">
                              Open RTS →
                            </Link>
                            <ExplainDrawer
                              entityType="WATCHLIST_ALERT"
                              entityId={a.id}
                              triggerLabel="Why?"
                              title={`Watchlist spike · ${a.title}`}
                            />
                            <CopilotDrawer
                              entityType="WATCHLIST_ALERT"
                              entityId={a.id}
                              triggerLabel="Why now?"
                              title={`Copilot · ${a.title}`}
                            />
                            <ActionMenu
                              ctx={{
                                entityType: "WATCHLIST_ALERT",
                                entityId: a.id,
                                watchlistId: a.watchlistId,
                                label: a.title,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total} page={page} pageSize={pageSize} totalPages={Math.ceil(total / pageSize)} />
        </>
      )}
    </div>
  );
}

