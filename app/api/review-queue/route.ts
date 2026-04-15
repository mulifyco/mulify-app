import { NextResponse } from "next/server";
import { reviewQueueItemDb } from "@/lib/prisma-review-queue-item-delegate";
import { auth } from "@/lib/auth";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50));
  const skip = (page - 1) * pageSize;

  const status = (searchParams.get("status") ?? "").trim();
  const type = (searchParams.get("type") ?? "").trim();
  const priorityRaw = (searchParams.get("priority") ?? "").trim();
  const search = (searchParams.get("search") ?? "").trim();

  const priority = priorityRaw ? Number.parseInt(priorityRaw, 10) : undefined;

  const where: any = {
    workspaceId,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(Number.isFinite(priority as any) ? { priority: { gte: priority } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { reason: { contains: search, mode: "insensitive" } },
            { entityId: { contains: search, mode: "insensitive" } },
            { sourceId: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    reviewQueueItemDb().findMany({
      where,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
    }),
    reviewQueueItemDb().count({ where }),
  ]);

  return NextResponse.json({ data: items, total, page, pageSize });
}

