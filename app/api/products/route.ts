import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ProductRepository } from "@/server/repositories/product.repository";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const search = searchParams.get("search") ?? undefined;
  const storeId = searchParams.get("storeId") ?? undefined;
  const vendor = searchParams.get("vendor") ?? undefined;

  const result = await ProductRepository.list({ search, storeId, vendor, page, pageSize });
  return NextResponse.json(result);
}
