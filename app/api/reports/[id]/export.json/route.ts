import { NextResponse } from "next/server";
import { ProductEventType } from "@/lib/analytics/product-event-types";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const row = await prisma.report.findFirst({ where: { id, workspaceId } }).catch(() => null);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  void trackProductEventFromSession(session, {
    eventType: ProductEventType.REPORT_EXPORT,
    path: `/api/reports/${row.id}/export.json`,
    entityType: "REPORT",
    entityId: row.id,
    metadata: { format: "json", reportType: row.type },
  });

  return NextResponse.json({
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    sourceContext: row.sourceContext,
    summary: row.summary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

