import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { RawRecordRepository } from "@/server/repositories/raw-record.repository";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const sourceId = searchParams.get("sourceId") ?? undefined;
  const entityType = searchParams.get("entityType") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const search = searchParams.get("search") ?? undefined;

  const result = await RawRecordRepository.list({
    sourceId,
    entityType: entityType as never,
    status: status as never,
    search,
    page,
    pageSize,
  });

  return NextResponse.json(result);
}
