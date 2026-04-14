import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50));
  const search = (searchParams.get("search") ?? "").trim();
  const promoted = searchParams.get("promoted");
  const minScoreRaw = searchParams.get("minScore");
  const minScore = minScoreRaw ? Math.max(0, Math.min(100, parseInt(minScoreRaw, 10) || 0)) : undefined;

  const where = {
    ...(search ? { domain: { contains: search, mode: "insensitive" as const } } : {}),
    ...(promoted === "true" ? { isPromoted: true } : {}),
    ...(promoted === "false" ? { isPromoted: false } : {}),
    ...(minScore != null ? { discoveryScore: { gte: minScore } } : {}),
  };

  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    (prisma as any).discoveryCandidate.findMany({
      where: where as never,
      orderBy: [{ discoveryScore: "desc" }, { updatedAt: "desc" }],
      skip,
      take: pageSize,
    }),
    (prisma as any).discoveryCandidate.count({ where: where as never }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

