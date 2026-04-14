import { NextResponse } from "next/server";
import prisma from "@/src/lib/prisma";
import { parsePageParams, sanitizeOrder, sanitizeSort } from "@/src/lib/api/query";
import { Platform } from "@prisma/client";
import { getCurrentUserEmail } from "@/src/lib/auth";
import { consumeCredits, InsufficientCreditsError } from "@/src/lib/credits";

const SORT_FIELDS = ["lastSeenAt", "firstSeenAt", "impressionsEstimate", "adCount", "createdAt"] as const;

function parsePlatform(raw: string | null): Platform | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toUpperCase();
  return (Object.values(Platform) as string[]).includes(v) ? (v as Platform) : undefined;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") ?? searchParams.get("search") ?? "").trim();
    const { page, pageSize, skip, take } = parsePageParams(searchParams, { page: 1, pageSize: 20 });
    const sort = sanitizeSort(searchParams.get("sort"), SORT_FIELDS, "lastSeenAt");
    const order = sanitizeOrder(searchParams.get("order"), "desc");

    const platform = parsePlatform(searchParams.get("platform"));
    const creativeClusterId = (searchParams.get("creativeClusterId") ?? "").trim() || undefined;

    const userEmail = getCurrentUserEmail();
    const user = await consumeCredits({ userEmail, amount: 1, action: "ADS_SEARCH" });

    const where = {
      ...(q.length
        ? {
            OR: [
              { adText: { contains: q, mode: "insensitive" as const } },
              { shop: { is: { name: { contains: q, mode: "insensitive" as const } } } },
              { shop: { is: { domain: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
      ...(platform ? { platform } : {}),
      ...(creativeClusterId ? { creativeClusterMember: { clusterId: creativeClusterId } } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.ad.findMany({
        where,
        include: {
          shop: true,
          confidenceScores: true,
          landingPages: { take: 3, select: { id: true, domain: true, url: true } },
          entityLinks: {
            where: { entityType: "STORE" },
            take: 2,
            include: { store: { select: { id: true, domain: true } } },
          },
        },
        orderBy: { [sort]: order },
        skip,
        take,
      }),
      prisma.ad.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, pageSize, creditsLeft: user.credits });
  } catch (e) {
    if (e instanceof InsufficientCreditsError || (e instanceof Error && e.message === "INSUFFICIENT_CREDITS")) {
      return NextResponse.json({ error: "Yetersiz kredi" }, { status: 402 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
