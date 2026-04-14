import PageHeader from "@/components/ui/PageHeader";
import SectionHeader from "@/components/internal/SectionHeader";
import StatCard from "@/components/ui/StatCard";
import PaywallPanel from "@/components/internal/PaywallPanel";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";
import { getProductAnalyticsOverview } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

function barRow(label: string, count: number, max: number) {
  const w = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div key={label} className="flex items-center gap-3 text-sm">
      <div className="w-40 shrink-0 truncate text-muted" title={label}>
        {label}
      </div>
      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-500/80" style={{ width: `${w}%` }} />
      </div>
      <div className="w-10 text-right tabular-nums text-foreground font-medium">{count}</div>
    </div>
  );
}

export default async function AnalyticsPage() {
  const session = await auth();
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "OPS")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Launch analytics"
          description="Product usage, funnels, and paywall signals (first-party events)."
        />
        <PaywallPanel
          feature="OPS"
          currentPlan={plan}
          title="Analytics is an Ops-area feature"
          description="Upgrade to view active users, board usage, exports, paywall hits, and onboarding funnel metrics."
        />
      </div>
    );
  }

  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Launch analytics"
          description="Product usage, funnels, and paywall signals (first-party events)."
        />
        <PaywallPanel
          feature="OPS"
          currentPlan={plan}
          title="No active workspace"
          description="Switch to a workspace to view analytics scoped to that tenant."
        />
      </div>
    );
  }

  const o = await getProductAnalyticsOverview(workspaceId);

  const boardMax = o.topBoards[0]?.count ?? 0;
  const paywallFeatMax = o.paywallByFeature[0]?.count ?? 0;
  const autoMax = o.topAutoActions[0]?.count ?? 0;
  const pathMax = o.topPaths[0]?.count ?? 0;
  const funnelSteps = [
    { label: "Login", n: o.funnel.login },
    { label: "Dashboard view", n: o.funnel.dashboardView },
    { label: "First source", n: o.funnel.firstSource },
    { label: "First watchlist", n: o.funnel.firstWatchlist },
    { label: "First compare", n: o.funnel.firstCompare },
    { label: "First report", n: o.funnel.firstReport },
  ];
  const funnelMax = Math.max(...funnelSteps.map((s) => s.n), 1);
  const dashRate =
    o.funnel.login > 0 ? Math.round((100 * o.funnel.dashboardView) / o.funnel.login) : null;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Launch analytics"
        description="First-party usage events (7d aggregates where noted; funnel uses distinct users over 30d)."
      />

      <div>
        <SectionHeader title="Overview (7d)" description="High-signal volume metrics." />
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Active users (7d)" value={String(o.activeUsers7d)} />
          <StatCard label="Compare runs" value={String(o.compareRuns7d)} />
          <StatCard label="Leads created" value={String(o.leadsCreated7d)} />
          <StatCard label="Report exports" value={String(o.reportExports7d)} />
          <StatCard label="Reports created" value={String(o.reportCreates7d)} />
          <StatCard label="Watchlists created" value={String(o.watchlistCreates7d)} />
          <StatCard label="Paywall hits" value={String(o.paywallHits7d)} />
          <StatCard label="Checkout starts" value={String(o.checkoutStarts7d)} />
          <StatCard label="Billing portal opens" value={String(o.portalOpens7d)} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div>
          <SectionHeader title="Onboarding funnel (30d)" description="Distinct users who fired each milestone event." />
          <div className="mt-3 space-y-2">
            {funnelSteps.map((s) => barRow(s.label, s.n, funnelMax))}
          </div>
          {dashRate != null ? (
            <p className="mt-3 text-xs text-muted">
              Best-effort activation: dashboard views / logins in window ≈{" "}
              <span className="text-foreground font-medium tabular-nums">{dashRate}%</span> (not a strict funnel;
              events are independent).
            </p>
          ) : null}
        </div>
        <div>
          <SectionHeader title="Pricing (7d)" description="Paywall by feature; checkout / portal totals are in Overview." />
          <div className="mt-3 rounded-lg border border-border bg-card p-4 text-sm">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">Paywall by feature</div>
            <div className="mt-3 space-y-2">
              {o.paywallByFeature.length === 0 ? (
                <div className="text-muted">No paywall hits in window.</div>
              ) : (
                o.paywallByFeature.map((r) => barRow(r.feature, r.count, paywallFeatMax))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div>
          <SectionHeader title="Top boards (7d)" description="BOARD_VIEW counts by boardKey." />
          <div className="mt-3 space-y-2">
            {o.topBoards.length === 0 ? (
              <div className="text-sm text-muted">No board views yet.</div>
            ) : (
              o.topBoards.map((r) => barRow(r.boardKey, r.count, boardMax))
            )}
          </div>
        </div>
        <div>
          <SectionHeader title="Top auto actions (7d)" description="AUTO_ACTION_RUN by actionType." />
          <div className="mt-3 space-y-2">
            {o.topAutoActions.length === 0 ? (
              <div className="text-sm text-muted">No auto actions yet.</div>
            ) : (
              o.topAutoActions.map((r) => barRow(r.actionType, r.count, autoMax))
            )}
          </div>
        </div>
      </div>

      <div>
        <SectionHeader title="Top viewed paths (7d)" description="From event path (server + client beacons)." />
        <div className="mt-3 space-y-2 max-w-3xl">
          {o.topPaths.length === 0 ? (
            <div className="text-sm text-muted">No paths recorded.</div>
          ) : (
            o.topPaths.map((r) => barRow(r.path, r.count, pathMax))
          )}
        </div>
      </div>

      <p className="text-xs text-muted max-w-2xl">
        Retention / sampling policy is not applied yet; table may grow. Future: TTL job or rollups.
      </p>
    </div>
  );
}
