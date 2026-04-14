import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const wl = await WatchlistRepository.findById(workspaceId, id);
  if (!wl) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const summary = await WatchlistRepository.summary(workspaceId, id);
  return NextResponse.json({ watchlist: wl, summary });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

  const name = body.name === null ? null : typeof body.name === "string" ? body.name : undefined;
  const description =
    body.description === null ? null : typeof body.description === "string" ? body.description : undefined;

  const updated = await WatchlistRepository.update(workspaceId, id, { name, description }).catch((e) =>
    NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 404 })
  );
  if (updated instanceof NextResponse) return updated;
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const res = await WatchlistRepository.delete(workspaceId, id).catch((e) =>
    NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 404 })
  );
  if (res instanceof NextResponse) return res;
  return NextResponse.json({ ok: true });
}

