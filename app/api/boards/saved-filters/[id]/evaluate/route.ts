import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SavedBoardFilterRepository } from "@/server/repositories/saved-board-filter.repository";
import { evaluateAndPersistSavedBoardFilter } from "@/server/services/saved-board-filter-evaluation.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const existing = await SavedBoardFilterRepository.findById(workspaceId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { matchedCount } = await evaluateAndPersistSavedBoardFilter({ workspaceId, savedFilterId: id });
    const item = await SavedBoardFilterRepository.findById(workspaceId, id);
    return NextResponse.json({ matchedCount, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Evaluation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
