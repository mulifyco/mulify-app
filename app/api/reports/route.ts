import { NextResponse } from "next/server";
import { ProductEventType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import prisma from "@/lib/prisma";
import { withRouteTiming } from "@/lib/perf/route-timing";
import { createReport } from "@/server/services/report.service";
import { canAccessFeature, getPlanLimits, getUserPlan, paywallResponse } from "@/lib/billing/access";
import { trackPaywallHitFromSession, trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "REPORTS")) {
    await trackPaywallHitFromSession(session, "REPORTS", "/api/reports");
    return NextResponse.json(paywallResponse("REPORTS", plan), { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") ?? "25", 10) || 25));
  const skip = (page - 1) * pageSize;

  const [rows, total] = await withRouteTiming("/api/reports", () =>
    Promise.all([
      prisma.report.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: { id: true, title: true, type: true, status: true, createdAt: true },
      }),
      prisma.report.count({ where: { workspaceId } }),
    ])
  );

  return jsonWithReadCache({ data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "REPORTS")) {
    await trackPaywallHitFromSession(session, "REPORTS", "/api/reports");
    return NextResponse.json(paywallResponse("REPORTS", plan), { status: 403 });
  }

  const limits = getPlanLimits(plan);
  if (limits.maxReportsPerMonth > 0) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const used = await prisma.report.count({ where: { workspaceId, createdAt: { gte: monthStart } } }).catch(() => 0);
    if (used >= limits.maxReportsPerMonth) {
      return NextResponse.json(
        {
          error: `Monthly report limit reached (max ${limits.maxReportsPerMonth}).`,
          code: "LIMIT",
          plan,
          upgradeUrl: "/pricing",
        },
        { status: 403 }
      );
    }
  }

  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { type: rawType, context: rawContext } = body as { type?: unknown; context?: unknown };
  const type = String(rawType ?? "").trim();
  const context = (rawContext && typeof rawContext === "object" ? rawContext : {}) as Record<string, unknown>;
  if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });

  try {
    let created: unknown;
    if (type === "BOARD_SNAPSHOT") {
      const ctx = context as { boardType?: unknown; take?: unknown; minScore?: unknown };
      const take = Number.isFinite(Number(ctx.take)) ? Number(ctx.take) : undefined;
      const minScore = Number.isFinite(Number(ctx.minScore)) ? Number(ctx.minScore) : undefined;
      created = await createReport({
        type: "BOARD_SNAPSHOT",
        context: { boardType: String(ctx.boardType ?? ""), take, minScore, workspaceId },
      });
    } else if (type === "WATCHLIST_SNAPSHOT") {
      const ctx = context as { watchlistId?: unknown };
      created = await createReport({
        type: "WATCHLIST_SNAPSHOT",
        context: { watchlistId: String(ctx.watchlistId ?? ""), workspaceId },
      });
    } else if (type === "COMPARE_SNAPSHOT") {
      const ctx = context as { domains?: unknown; storeIds?: unknown };
      const domains = Array.isArray(ctx.domains) ? ctx.domains.map(String) : [];
      const storeIds = Array.isArray(ctx.storeIds) ? ctx.storeIds.map(String) : [];
      created = await createReport({ type: "COMPARE_SNAPSHOT", context: { domains, storeIds, workspaceId } });
    } else if (type === "EXECUTIVE_SUMMARY") {
      created = await createReport({ type: "EXECUTIVE_SUMMARY", context: { scope: "default", workspaceId } });
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const cid = (created as { id?: string }).id;
    if (cid) {
      void trackProductEventFromSession(session, {
        eventType: ProductEventType.REPORT_CREATE,
        path: "/api/reports",
        entityType: "REPORT",
        entityId: cid,
        metadata: { type },
      });
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

