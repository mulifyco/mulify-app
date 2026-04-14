import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { getCachedDashboardStats } from "@/lib/perf/cached-server-data";
import { withRouteTiming } from "@/lib/perf/route-timing";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await withRouteTiming("/api/dashboard", () => getCachedDashboardStats());
    return jsonWithReadCache(stats);
  } catch (err) {
    console.error("[api/dashboard]", err);
    return NextResponse.json(
      { error: "Failed to load dashboard stats" },
      { status: 500 }
    );
  }
}
