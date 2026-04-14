import { NextResponse } from "next/server";
import { ProductEventType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { patchReviewQueueItem } from "@/server/services/review-queue.service";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { status?: string; priority?: number; resolutionNote?: string | null }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const status = body.status ? String(body.status) : undefined;
  const allowedStatus = new Set(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]);
  if (status && !allowedStatus.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const priority =
    body.priority != null ? Math.max(0, Math.min(100, Number(body.priority))) : undefined;

  const exists = await prisma.reviewQueueItem
    .findFirst({ where: { id, workspaceId }, select: { id: true } })
    .catch(() => null);
  if (!exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await patchReviewQueueItem(id, {
    status: status as any,
    priority,
    resolutionNote: body.resolutionNote,
  });

  if (status === "RESOLVED") {
    void trackProductEventFromSession(session, {
      eventType: ProductEventType.REVIEW_ITEM_RESOLVE,
      path: `/api/review-queue/${id}`,
      entityType: "REVIEW_QUEUE_ITEM",
      entityId: id,
    });
  }

  return NextResponse.json({ data: updated });
}

