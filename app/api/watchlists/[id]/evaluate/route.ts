import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { evaluateWatchlistAndPersist } from "@/server/services/watchlist-evaluation.service";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const res = await evaluateWatchlistAndPersist({ watchlistId: id, triggeredBy: "manual" });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Evaluation failed" }, { status: 500 });
  }
}

