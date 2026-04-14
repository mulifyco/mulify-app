import { NextResponse } from "next/server";
import { buildSystemFreshness } from "@/server/services/system-freshness.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await buildSystemFreshness().catch((e) => {
    return { error: e instanceof Error ? e.message : "Failed" } as any;
  });
  if ((data as any)?.error) return NextResponse.json({ error: (data as any).error }, { status: 500 });
  return NextResponse.json({ data });
}

