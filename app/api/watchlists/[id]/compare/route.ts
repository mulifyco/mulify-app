import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import { withRouteTiming } from "@/lib/perf/route-timing";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const data = await withRouteTiming("/api/watchlists/compare", () => WatchlistRepository.compare(workspaceId, id));
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return jsonWithReadCache(data);
}

