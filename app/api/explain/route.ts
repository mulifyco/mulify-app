import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { explainEntity } from "@/server/services/explainability.service";

export const dynamic = "force-dynamic";

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
    const data = await explainEntity({ entityType, entityId });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 200 } // graceful partial data
    );
  }
}

