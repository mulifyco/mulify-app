import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hookIntelligenceForEntity } from "@/server/services/hook-intelligence.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const entityType = (url.searchParams.get("entityType") ?? "").trim();
  const entityId = (url.searchParams.get("entityId") ?? "").trim();
  if (!entityType || !entityId) return NextResponse.json({ error: "entityType/entityId are required" }, { status: 400 });

  const data = await hookIntelligenceForEntity({ entityType, entityId }).catch((e) => {
    return { error: e instanceof Error ? e.message : "Failed" } as any;
  });
  if ((data as any)?.error) return NextResponse.json({ error: (data as any).error }, { status: 500 });
  return NextResponse.json({ data });
}

