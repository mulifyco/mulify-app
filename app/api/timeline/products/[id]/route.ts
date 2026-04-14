import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { parseTimelineRange } from "@/lib/timeline/parse-range";
import {
  getProductClusterTimeline,
  resolveProductTimelineClusterId,
} from "@/server/services/timeline.service";
import { withRouteTiming } from "@/lib/perf/route-timing";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const clusterId = await resolveProductTimelineClusterId(id);
  if (!clusterId) {
    return NextResponse.json({ error: "Product cluster not found for this id" }, { status: 404 });
  }

  const range = parseTimelineRange(new URL(req.url).searchParams);
  const data = await withRouteTiming("/api/timeline/products", () =>
    getProductClusterTimeline(clusterId, range)
  );
  return jsonWithReadCache({
    ...data,
    resolvedClusterId: clusterId,
    note: "id may be ProductCluster id or Product id (member lookup).",
  });
}
