import { NextRequest, NextResponse } from "next/server";
import { ProductEventType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import prisma from "@/lib/prisma";
import { canAccessFeature, getPlanLimits, getUserPlan, paywallResponse } from "@/lib/billing/access";
import { trackPaywallHitFromSession, trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));

  const result = await WatchlistRepository.list({ workspaceId, page, pageSize });
  return jsonWithReadCache(result);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "WATCHLISTS")) {
    await trackPaywallHitFromSession(session, "WATCHLISTS", "/api/watchlists");
    return NextResponse.json(paywallResponse("WATCHLISTS", plan), { status: 403 });
  }

  const limits = getPlanLimits(plan);
  if (limits.maxWatchlists > 0) {
    const count = await prisma.watchlist.count({ where: { workspaceId } }).catch(() => 0);
    if (count >= limits.maxWatchlists) {
      return NextResponse.json(
        { error: `Watchlist limit reached (max ${limits.maxWatchlists}).`, code: "LIMIT", plan },
        { status: 403 }
      );
    }
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description : null;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const created = await WatchlistRepository.create({ workspaceId, name, description });
  void trackProductEventFromSession(session, {
    eventType: ProductEventType.WATCHLIST_CREATE,
    path: "/api/watchlists",
    entityType: "WATCHLIST",
    entityId: created.id,
    metadata: { name },
  });
  return NextResponse.json(created, { status: 201 });
}

