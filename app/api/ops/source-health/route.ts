import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { getCachedOpsSourceHealth } from "@/lib/perf/cached-server-data";
import { withRouteTiming } from "@/lib/perf/route-timing";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const payload = await withRouteTiming("/api/ops/source-health", () => getCachedOpsSourceHealth());
    return jsonWithReadCache(payload);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

