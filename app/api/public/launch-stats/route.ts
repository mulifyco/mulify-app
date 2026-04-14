import { NextResponse } from "next/server";
import { getLaunchProofStats } from "@/lib/launch/proof-stats";

export const dynamic = "force-dynamic";

/** Public, cache-friendly stats for marketing (no secrets). */
export async function GET() {
  const stats = await getLaunchProofStats();
  return NextResponse.json(stats, {
    headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=300" },
  });
}
