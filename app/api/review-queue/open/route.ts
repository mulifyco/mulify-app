import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { openReviewQueueItem } from "@/server/services/review-queue.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as any;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!type || !title || !reason) {
    return NextResponse.json({ error: "type/title/reason are required" }, { status: 400 });
  }

  const priority = body.priority != null ? Math.max(0, Math.min(100, Number(body.priority))) : undefined;

  const created = await openReviewQueueItem({
    workspaceId,
    type,
    title,
    reason,
    priority,
    entityType: body.entityType ?? null,
    entityId: body.entityId ?? null,
    sourceId: body.sourceId ?? null,
    metadata: body.metadata ?? undefined,
  });

  return NextResponse.json({ data: created }, { status: 201 });
}

