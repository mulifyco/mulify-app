import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { offerAnalyzerEntity } from "@/server/services/landing-offer-analyzer.service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const entityType = (url.searchParams.get("entityType") ?? "").trim();
  const entityId = (url.searchParams.get("entityId") ?? "").trim();
  if (!entityType || !entityId) return NextResponse.json({ error: "entityType/entityId are required" }, { status: 400 });

  const data = await offerAnalyzerEntity({ entityType, entityId }).catch(() => null);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

