import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ProductClusterRepository } from "@/server/repositories/product-cluster.repository";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const take = Math.max(1, Math.min(200, parseInt(searchParams.get("take") ?? "50", 10) || 50));

  const rows = await ProductClusterRepository.listTrending({ take });
  return NextResponse.json({
    data: rows.map((c) => ({
      id: c.id,
      key: c.key,
      title: c.title,
      storeCount: c.storeCount,
      collectionCount: c.collectionCount,
      landingPageCount: c.landingPageCount,
      linkedRawRecordCount: c.linkedRawRecordCount,
      firstSeenAt: c.firstSeenAt,
      lastSeenAt: c.lastSeenAt,
      saturationScore: c.saturationScore,
      winningScore: c.winningScore,
      crossStoreScore: c.crossStoreScore,
      confidence: c.confidence,
    })),
  });
}

