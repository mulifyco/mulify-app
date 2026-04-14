import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { copilotEntity } from "@/server/services/opportunity-copilot.service";
import { withRouteTiming } from "@/lib/perf/route-timing";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityType = (searchParams.get("entityType") ?? "").trim();
  const entityId = (searchParams.get("entityId") ?? "").trim();
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "Missing entityType/entityId" }, { status: 400 });
  }

  try {
    const data = await withRouteTiming("/api/copilot", () => copilotEntity({ entityType, entityId }));
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return jsonWithReadCache({ data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 200 }); // graceful
  }
}

