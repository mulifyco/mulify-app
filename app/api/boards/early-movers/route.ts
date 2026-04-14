import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { dedupeBoardRowsByClusterId } from "@/lib/intelligence/board-dedupe";
import { EarlyMoversBoardRepository } from "@/server/repositories/early-movers-board.repository";
import { withRouteTiming } from "@/lib/perf/route-timing";

function daysSince(d: Date): number {
  return (Date.now() - d.getTime()) / 86400000;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const take = Math.max(1, Math.min(200, parseInt(searchParams.get("take") ?? "30", 10) || 30));
  const minScoreRaw = searchParams.get("minScore");
  const minScore =
    minScoreRaw != null && minScoreRaw !== "" ? Math.max(0, Math.min(100, parseFloat(minScoreRaw) || 0)) : 0;

  const rows = dedupeBoardRowsByClusterId(
    await withRouteTiming("/api/boards/early-movers", () =>
      EarlyMoversBoardRepository.list({ take, minScore })
    )
  );

  return jsonWithReadCache({
    data: rows.map((r) => {
      const ageDays = daysSince(r.firstSeenAt);
      const freshnessDays = daysSince(r.lastSeenAt);
      return {
        clusterId: r.clusterId,
        title: r.title ?? r.primaryProductTitle ?? null,
        earlyMoverScore: r.earlyMoverScore,
        readyToScaleScore: r.readyToScaleScore,
        winningScore: r.winningScore,
        saturationScore: r.saturationScore,
        storeCount: r.storeCount,
        linkedRawRecordCount: r.linkedRawRecordCount,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        ageDays: Math.round(ageDays * 10) / 10,
        freshnessDays: Math.round(freshnessDays * 10) / 10,
      };
    }),
  });
}

