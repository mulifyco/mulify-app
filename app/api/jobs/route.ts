import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { JobRepository } from "@/server/repositories/job.repository";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const sourceId = searchParams.get("sourceId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const result = await JobRepository.list({ sourceId, status: status as never, page, pageSize });
  return NextResponse.json(result);
}
