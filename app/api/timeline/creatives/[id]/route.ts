import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { parseTimelineRange } from "@/lib/timeline/parse-range";
import {
  getCreativeClusterTimeline,
  resolveCreativeTimelineClusterId,
} from "@/server/services/timeline.service";
import { withRouteTiming } from "@/lib/perf/route-timing";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const clusterId = await resolveCreativeTimelineClusterId(id);
  if (!clusterId) {
    return NextResponse.json({ error: "Creative cluster not found for this id" }, { status: 404 });
  }

  const range = parseTimelineRange(new URL(req.url).searchParams);
  const data = await withRouteTiming("/api/timeline/creatives", () =>
    getCreativeClusterTimeline(clusterId, range)
  );
  return jsonWithReadCache({
    ...data,
    resolvedClusterId: clusterId,
    note: "id may be CreativeCluster id or Ad id (member lookup).",
  });
}
