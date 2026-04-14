import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const domain = typeof body.domain === "string" ? body.domain.trim() : "";
  const label = typeof body.label === "string" ? body.label : null;
  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });

  const item = await WatchlistRepository.addDomain(workspaceId, id, { domain, label }).catch((e) =>
    NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 404 })
  );
  if (item instanceof NextResponse) return item;
  return NextResponse.json(item, { status: 201 });
}

