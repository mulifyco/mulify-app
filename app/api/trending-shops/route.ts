import { NextResponse } from "next/server";
import prisma from "@/src/lib/prisma";
import { parsePageParams, sanitizeOrder, sanitizeSort } from "@/src/lib/api/query";
import { getCurrentUserEmail } from "@/src/lib/auth";
import { consumeCredits, InsufficientCreditsError } from "@/src/lib/credits";

const SORT_FIELDS = [
  "trendScore",
  "monthlyVisits",
  "estimatedDailyRevenue",
  "activeMetaAds",
  "createdAt",
  "name",
] as const;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const { page, pageSize, skip, take } = parsePageParams(searchParams, { page: 1, pageSize: 20 });
    const sort = sanitizeSort(searchParams.get("sort"), SORT_FIELDS, "trendScore");
    const order = sanitizeOrder(searchParams.get("order"), "desc");

    const userEmail = getCurrentUserEmail();
    const user = await consumeCredits({ userEmail, amount: 1, action: "TRENDING_SHOPS_SEARCH" });

    const where =
      q.length > 0
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { domain: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {};

    const [items, total] = await Promise.all([
      prisma.shop.findMany({
        where,
        orderBy: { [sort]: order },
        skip,
        take,
        include: {
          metrics: {
            take: 2,
            orderBy: { date: "desc" },
            select: { visitsGrowth1m: true, activeMetaAds: true, date: true },
          },
        },
      }),
      prisma.shop.count({ where }),
    ]);

    const shaped = items.map((s) => {
      const latest = s.metrics[0];
      const prev = s.metrics[1];
      const activeAdsDelta =
        latest && prev && typeof latest.activeMetaAds === "number" && typeof prev.activeMetaAds === "number"
          ? latest.activeMetaAds - prev.activeMetaAds
          : null;
      return {
        id: s.id,
        domain: s.domain,
        name: s.name,
        trendScore: s.trendScore,
        monthlyVisits: s.monthlyVisits,
        estimatedDailyRevenue: s.estimatedDailyRevenue,
        activeMetaAds: s.activeMetaAds,
        currency: s.currency ?? null,
        latestGrowth1m: latest?.visitsGrowth1m ?? null,
        activeAdsDelta,
        createdAt: s.createdAt,
      };
    });

    return NextResponse.json({ items: shaped, total, page, pageSize, creditsLeft: user.credits });
  } catch (e) {
    if (e instanceof InsufficientCreditsError || (e instanceof Error && e.message === "INSUFFICIENT_CREDITS")) {
      return NextResponse.json({ error: "Yetersiz kredi" }, { status: 402 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

