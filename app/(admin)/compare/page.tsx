import PageHeader from "@/components/ui/PageHeader";
import CompareClient from "./CompareClient";
import prisma from "@/lib/prisma";
import CreateReportButton from "@/components/internal/CreateReportButton";
import PaywallPanel from "@/components/internal/PaywallPanel";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ domains?: string; storeIds?: string; watchlistId?: string }>;
}) {
  const session = await auth();
  const plan = getUserPlan(session);
  const params = await searchParams;
  let initialDomains = parseList(params.domains);
  const initialStoreIds = parseList(params.storeIds);

  // Watchlist shortcut: /compare?watchlistId=...
  if (params.watchlistId && initialDomains.length === 0) {
    try {
      const wl = await prisma.watchlist.findUnique({
        where: { id: params.watchlistId },
        select: { stores: { select: { domain: true } } },
      });
      if (wl?.stores?.length) {
        initialDomains = wl.stores.map((s) => s.domain).slice(0, 20);
      }
    } catch {
      // ignore
    }
  }

  if (!canAccessFeature(plan, "COMPARE")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Compare" description="Side-by-side store & cluster comparison." />
        <PaywallPanel
          feature="COMPARE"
          currentPlan={plan}
          title="Compare is a Pro feature"
          description="Upgrade to unlock side-by-side comparisons, cluster rollups, and shareable snapshots."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Compare"
        description="Side-by-side store & cluster comparison. Add domains, or load from a watchlist."
        action={
          initialDomains.length || initialStoreIds.length ? (
            <CreateReportButton
              label="Create report"
              variant="primary"
              payload={{ type: "COMPARE_SNAPSHOT", context: { domains: initialDomains, storeIds: initialStoreIds } }}
            />
          ) : null
        }
      />
      <CompareClient initialDomains={initialDomains} initialStoreIds={initialStoreIds} />
    </div>
  );
}

