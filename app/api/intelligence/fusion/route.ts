import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { batchRecomputeFusionScores } from "@/server/intelligence/fusion-score.service";

/** POST — winning-probability fusion only (stores, products, ads). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { storeLimit?: number; productLimit?: number; adLimit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const result = await batchRecomputeFusionScores({
      storeLimit: body.storeLimit,
      productLimit: body.productLimit,
      adLimit: body.adLimit,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/intelligence/fusion]", err);
    return NextResponse.json({ error: "Fusion recompute failed" }, { status: 500 });
  }
}
