import PageHeader from "@/components/ui/PageHeader";
import SavedBoardFiltersClient from "@/components/internal/SavedBoardFiltersClient";
import { SavedBoardFilterRepository } from "@/server/repositories/saved-board-filter.repository";
import PaywallPanel from "@/components/internal/PaywallPanel";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";
import { trackBoardViewServer } from "@/lib/analytics/track-board-server";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export default async function SavedBoardFiltersPage() {
  const session = await auth();
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "SAVED_FILTERS")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Saved filters"
          description="Board-based rules you can evaluate now and wire to alerts or automation later."
        />
        <PaywallPanel
          feature="SAVED_FILTERS"
          currentPlan={plan}
          title="Saved filters are a Pro feature"
          description="Upgrade to create filters, run evaluations, and drive board alert logs."
        />
      </div>
    );
  }

  await trackBoardViewServer("saved-filters", "/boards/saved-filters");
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: "" }));
  let items: Awaited<ReturnType<typeof SavedBoardFilterRepository.list>> = [];
  let error: string | null = null;
  try {
    items = workspaceId ? await SavedBoardFilterRepository.list(workspaceId) : [];
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load saved filters.";
  }

  return (
    <div>
      <PageHeader
        title="Saved filters"
        description="Board-based rules you can evaluate now and wire to alerts or automation later."
      />

      {error ? (
        <div className="mb-4 rounded border border-border bg-card px-3 py-2 text-sm text-muted">{error}</div>
      ) : (
        <SavedBoardFiltersClient initialItems={items} />
      )}
    </div>
  );
}
