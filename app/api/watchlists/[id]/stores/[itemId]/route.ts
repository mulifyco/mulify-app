import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id, itemId } = await ctx.params;
  try {
    await WatchlistRepository.removeItem(workspaceId, id, itemId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

