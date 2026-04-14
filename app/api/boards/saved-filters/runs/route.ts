import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import prisma from "@/lib/prisma";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50));
  const savedFilterId = (searchParams.get("savedFilterId") ?? "").trim() || undefined;

  const where = savedFilterId ? { workspaceId, savedFilterId } : { workspaceId };
  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    prisma.savedBoardFilterRun.findMany({
      where: where as never,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: { savedFilter: { select: { id: true, name: true, boardType: true } } },
    }),
    prisma.savedBoardFilterRun.count({ where: where as never }),
  ]);

  return jsonWithReadCache({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

