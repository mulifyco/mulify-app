import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AdRepository } from "@/server/repositories/ad.repository";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const search = searchParams.get("search") ?? undefined;
  const isActiveParam = searchParams.get("isActive");
  const isActive =
    isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;

  const result = await AdRepository.list({ search, isActive, page, pageSize });
  return NextResponse.json(result);
}
