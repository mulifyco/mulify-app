import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { batchRecomputeProductProminence } from "@/server/intelligence/prominence-engine.service";

/** POST — recompute product prominence only. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const result = await batchRecomputeProductProminence({ limit: body.limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/intelligence/prominence]", err);
    return NextResponse.json({ error: "Prominence recompute failed" }, { status: 500 });
  }
}
