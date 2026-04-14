import PageHeader from "@/components/ui/PageHeader";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import WatchlistsClient from "./WatchlistsClient";
import PaywallPanel from "@/components/internal/PaywallPanel";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export default async function WatchlistsPage() {
  const session = await auth();
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "WATCHLISTS")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Watchlists" description="Competitor tracking and compare views." />
        <PaywallPanel
          feature="WATCHLISTS"
          currentPlan={plan}
          title="Watchlists are a Pro feature"
          description="Upgrade to manage competitor watchlists, run evaluations, and track spikes over time."
        />
      </div>
    );
  }

  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: "" }));
  if (!workspaceId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Watchlists" description="Competitor tracking and compare views." />
        <QueryErrorState message="No active workspace." />
      </div>
    );
  }

  let items: Awaited<ReturnType<typeof WatchlistRepository.list>>["data"] = [];
  let error: string | null = null;
  try {
    items = (await WatchlistRepository.list({ workspaceId, page: 1, pageSize: 80 })).data;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load watchlists.";
  }

  return (
    <div>
      <PageHeader title="Watchlists" description="Competitor tracking and compare views." />
      {error ? (
        <QueryErrorState message={error} />
      ) : (
        <WatchlistsClient initialItems={items as unknown as Parameters<typeof WatchlistsClient>[0]["initialItems"]} />
      )}
    </div>
  );
}

