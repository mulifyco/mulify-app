import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { countSavedBoardFilterAlertLogs, findManySavedBoardFilterAlertLogs } from "@/lib/saved-board-filter-alert-log";
import { withRouteTiming } from "@/lib/perf/route-timing";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(searchParams.get("pageSize") ?? "30", 10) || 30));
  const severity = (searchParams.get("severity") ?? "").trim() || undefined;
  const boardType = (searchParams.get("boardType") ?? "").trim() || undefined;
  const savedFilterId = (searchParams.get("savedFilterId") ?? "").trim() || undefined;

  const where = {
    ...(severity ? { severity } : {}),
    ...(boardType ? { boardType } : {}),
    ...(savedFilterId ? { savedFilterId } : {}),
  };
  const skip = (page - 1) * pageSize;

  const [items, total] = await withRouteTiming("/api/boards/alerts", () =>
    Promise.all([
      findManySavedBoardFilterAlertLogs({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { savedFilter: { select: { id: true, name: true } } },
      }),
      countSavedBoardFilterAlertLogs({ where: where as never }),
    ])
  );

  return jsonWithReadCache({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}

