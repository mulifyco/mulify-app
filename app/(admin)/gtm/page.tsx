import PageHeader from "@/components/ui/PageHeader";
import PaywallPanel from "@/components/internal/PaywallPanel";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";
import GtmBoardClient from "@/app/(admin)/gtm/GtmBoardClient";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";
import { getGtmDashboardStatsForWorkspace, listGtmLeadsByStageForWorkspace } from "@/server/services/gtm.service";

export const dynamic = "force-dynamic";

export default async function GtmPage() {
  const session = await auth();
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "OPS")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="GTM (founder sales)"
          description="Outbound pipeline, demos, and follow-ups for Mulify’s first customers."
        />
        <PaywallPanel
          feature="OPS"
          currentPlan={plan}
          title="GTM cockpit is an internal Ops-area tool"
          description="Upgrade to Pro-level access to manage founder-led pipeline alongside ops and analytics."
        />
      </div>
    );
  }

  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: "" }));
  const [byStage, stats] = workspaceId
    ? await Promise.all([
        listGtmLeadsByStageForWorkspace(workspaceId),
        getGtmDashboardStatsForWorkspace(workspaceId),
      ])
    : [{ } as any, null as any];

  return (
    <div className="space-y-6">
      <PageHeader
        title="GTM — founder sales OS"
        description="Pipeline, demos, trials, and lightweight outreach templates. Inbound demo requests land here from the marketing site."
      />
      <GtmBoardClient initialByStage={byStage} initialStats={stats} />
    </div>
  );
}
