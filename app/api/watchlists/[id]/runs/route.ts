import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50));
  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    prisma.watchlistRun.findMany({
      where: { watchlistId: id, workspaceId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.watchlistRun.count({ where: { watchlistId: id, workspaceId } }),
  ]);

  return NextResponse.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

