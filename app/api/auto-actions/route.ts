import { NextResponse } from "next/server";
import { ProductEventType } from "@/lib/analytics/product-event-types";
import { auth } from "@/lib/auth";
import { executeAutoAction, type AutoActionType, type AutoEntityType } from "@/server/services/auto-actions.service";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const b = body as { entityType?: unknown; entityId?: unknown; actionType?: unknown; context?: unknown };
  const entityType = String(b.entityType ?? "").trim();
  const entityId = String(b.entityId ?? "").trim();
  const actionType = String(b.actionType ?? "").trim();
  const context = b.context && typeof b.context === "object" ? (b.context as Record<string, unknown>) : undefined;

  if (!entityType || !entityId || !actionType) {
    return NextResponse.json({ error: "entityType/entityId/actionType are required" }, { status: 400 });
  }

  const allowedEntityTypes: AutoEntityType[] = [
    "PRODUCT_CLUSTER",
    "CREATIVE_CLUSTER",
    "STORE",
    "WATCHLIST_ALERT",
    "DISCOVERY_CANDIDATE",
    "PRODUCT",
    "LANDING_PAGE",
  ];
  const allowedActionTypes: AutoActionType[] = [
    "ADD_TO_WATCHLIST",
    "OPEN_COMPARE",
    "CREATE_REPORT",
    "OPEN_REVIEW",
    "PROMOTE_SOURCE",
    "OPEN_ADS",
    "OPEN_PRODUCTS",
    "CREATE_SOURCE",
    "OPEN_CAMPAIGN_BRIEF",
    "OPEN_OFFER_ANALYZER",
    "OPEN_PERSONA_ANALYZER",
    "CREATE_LEAD",
    "OPEN_LEAD",
    "CREATE_GTM_LEAD",
    "OPEN_GTM",
    "SCHEDULE_FOLLOW_UP",
  ];

  if (!allowedEntityTypes.includes(entityType as AutoEntityType)) {
    return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
  }
  if (!allowedActionTypes.includes(actionType as AutoActionType)) {
    return NextResponse.json({ error: "Invalid actionType" }, { status: 400 });
  }

  const res = await executeAutoAction({
    entityType: entityType as AutoEntityType,
    entityId,
    actionType: actionType as AutoActionType,
    context,
    workspaceId,
  }).catch((e) => ({ ok: false, message: e instanceof Error ? e.message : "Failed" }));

  if (res.ok) {
    void trackProductEventFromSession(session, {
      eventType: ProductEventType.AUTO_ACTION_RUN,
      path: "/api/auto-actions",
      entityType,
      entityId,
      metadata: { actionType },
    });
  }

  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

