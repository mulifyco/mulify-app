import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { dedupeBoardRowsByClusterId } from "@/lib/intelligence/board-dedupe";
import { ReadyToScaleBoardRepository } from "@/server/repositories/ready-to-scale-board.repository";
import { withRouteTiming } from "@/lib/perf/route-timing";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const take = Math.max(1, Math.min(200, parseInt(searchParams.get("take") ?? "30", 10) || 30));
  const minScoreRaw = searchParams.get("minScore");
  const minScore =
    minScoreRaw != null && minScoreRaw !== "" ? Math.max(0, Math.min(100, parseFloat(minScoreRaw) || 0)) : 0;

  const rows = dedupeBoardRowsByClusterId(
    await withRouteTiming("/api/boards/ready-to-scale", () =>
      ReadyToScaleBoardRepository.list({ take, minScore })
    )
  );

  return jsonWithReadCache({
    data: rows.map((r) => ({
      clusterId: r.clusterId,
      title: r.title ?? r.primaryProductTitle ?? null,
      primaryProductName: r.primaryProductTitle ?? r.title ?? null,
      primaryProductId: r.primaryProductId,
      readyToScaleScore: r.readyToScaleScore,
      winningScore: r.winningScore,
      saturationScore: r.saturationScore,
      storeCount: r.storeCount,
      collectionCount: r.collectionCount,
      landingPageCount: r.landingPageCount,
      linkedRawRecordCount: r.linkedRawRecordCount,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      linkedCreativeClusterCount: r.linkedCreativeClusterCount,
    })),
  });
}

