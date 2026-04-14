import { NextRequest, NextResponse } from "next/server";
import { ProductEventType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { getCachedCompareStores } from "@/lib/perf/cached-server-data";
import { withRouteTiming } from "@/lib/perf/route-timing";
import { canAccessFeature, getPlanLimits, getUserPlan, paywallResponse } from "@/lib/billing/access";
import { trackPaywallHitFromSession, trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { enqueueCompareRivalCandidates } from "@/server/services/feedback-candidates.service";

function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 25);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "COMPARE")) {
    await trackPaywallHitFromSession(session, "COMPARE", "/api/compare/stores");
    return NextResponse.json(paywallResponse("COMPARE", plan), { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const domains = splitList(searchParams.get("domains"));
  const storeIds = splitList(searchParams.get("storeIds"));

  if (domains.length === 0 && storeIds.length === 0) {
    return NextResponse.json({ error: "domains or storeIds is required" }, { status: 400 });
  }

  const limits = getPlanLimits(plan);
  if (limits.maxCompareDomains > 0 && domains.length > limits.maxCompareDomains) {
    return NextResponse.json(
      { error: `Compare limit exceeded (max ${limits.maxCompareDomains} domains).`, code: "LIMIT", plan },
      { status: 403 }
    );
  }

  const data = await withRouteTiming("/api/compare/stores", () => getCachedCompareStores(domains, storeIds));
  // Best-effort feedback loop: strong compare rivals → discovery candidate backlog (no direct source create here).
  try {
    const strong = (data?.stores ?? [])
      .filter((r: any) => (Number(r.trendScore ?? 0) >= 7 || Number(r.avgReadyToScaleScore ?? 0) >= 6) && Number(r.totalProducts ?? 0) >= 8)
      .map((r: any) => String(r.domain ?? ""))
      .filter(Boolean)
      .slice(0, 10);
    if (strong.length) {
      void enqueueCompareRivalCandidates({
        domains: strong,
        scoreHint: 76,
        reason: "Feedback seed (compare rival) — strong competitor in compare results.",
        perRequestCap: 8,
      });
    }
  } catch {
    /* non-fatal */
  }
  void trackProductEventFromSession(session, {
    eventType: ProductEventType.COMPARE_RUN,
    path: "/api/compare/stores",
    metadata: { domainCount: domains.length, storeIdCount: storeIds.length },
  });
  return jsonWithReadCache(data);
}

