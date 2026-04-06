import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runIntelligenceOrchestrator, type IntelligenceStage } from "@/server/intelligence/orchestrator";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    stages?: IntelligenceStage[];
    syncLegacyScores?: boolean;
    limitPerType?: number;
    maxAds?: number;
    storeLimit?: number;
    productLimit?: number;
    prominenceProductLimit?: number;
    fusionStoreLimit?: number;
    fusionProductLimit?: number;
    fusionAdLimit?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const result = await runIntelligenceOrchestrator({
      stages: body.stages,
      linking: body.maxAds != null ? { maxAds: body.maxAds } : undefined,
      confidence: {
        limitPerType: body.limitPerType,
        syncLegacyScores: body.syncLegacyScores,
      },
      traffic: {
        storeLimit: body.storeLimit,
        productLimit: body.productLimit,
      },
      prominence: {
        productLimit: body.prominenceProductLimit,
      },
      fusion: {
        storeLimit: body.fusionStoreLimit,
        productLimit: body.fusionProductLimit,
        adLimit: body.fusionAdLimit,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/intelligence/recompute]", err);
    return NextResponse.json(
      { error: "Intelligence recompute failed" },
      { status: 500 }
    );
  }
}
