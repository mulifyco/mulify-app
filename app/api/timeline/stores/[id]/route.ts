import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import prisma from "@/lib/prisma";
import { parseTimelineRange } from "@/lib/timeline/parse-range";
import { getStoreTimeline } from "@/server/services/timeline.service";
import { withRouteTiming } from "@/lib/perf/route-timing";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const store = await prisma.store.findUnique({ where: { id }, select: { id: true } });
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const range = parseTimelineRange(new URL(req.url).searchParams);
  const data = await withRouteTiming("/api/timeline/stores", () => getStoreTimeline(id, range));
  return jsonWithReadCache(data);
}
