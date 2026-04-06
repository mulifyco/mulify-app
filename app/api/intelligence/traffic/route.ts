import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { batchRecomputeTrafficScores } from "@/server/intelligence/traffic-score.service";

/**
 * POST — recompute store + product traffic scores only (no linking/signals/confidence).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { storeLimit?: number; productLimit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const result = await batchRecomputeTrafficScores({
      storeLimit: body.storeLimit,
      productLimit: body.productLimit,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/intelligence/traffic]", err);
    return NextResponse.json({ error: "Traffic recompute failed" }, { status: 500 });
  }
}
