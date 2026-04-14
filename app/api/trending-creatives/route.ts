import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { CreativeClusterRepository } from "@/server/repositories/creative-cluster.repository";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const take = Math.max(1, Math.min(200, parseInt(searchParams.get("take") ?? "50", 10) || 50));

  const rows = await CreativeClusterRepository.listTrending(take);
  return NextResponse.json({
    data: rows.map((c) => ({
      id: c.id,
      fingerprint: c.fingerprint,
      platform: c.platform,
      creativeCount: c.creativeCount,
      storeCount: c.storeCount,
      productClusterCount: c.productClusterCount,
      firstSeenAt: c.firstSeenAt,
      lastSeenAt: c.lastSeenAt,
      saturationScore: c.saturationScore,
      scaleScore: c.scaleScore,
      confidence: c.confidence,
    })),
  });
}

