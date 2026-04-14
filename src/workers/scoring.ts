import prisma from "@/src/lib/prisma";
import { calculateTrendScore } from "@/src/lib/scoring";

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return ms / 86400000;
}

export async function recalculateScoresJob(): Promise<{ shopsScored: number }> {
  const shops = await prisma.shop.findMany({
    select: {
      id: true,
      activeMetaAds: true,
      estimatedDailyRevenue: true,
      lastSeenAt: true,
      metrics: {
        take: 1,
        orderBy: { date: "desc" },
        select: { visitsGrowth1m: true, date: true },
      },
    },
  });

  const now = new Date();
  for (const s of shops) {
    const latest = s.metrics[0];
    const trafficGrowth1m = latest?.visitsGrowth1m ?? 0;
    const freshnessDays = s.lastSeenAt ? daysBetween(now, s.lastSeenAt) : 999;

    const score = calculateTrendScore({
      trafficGrowth1m,
      activeAds: s.activeMetaAds ?? 0,
      estimatedDailyRevenue: s.estimatedDailyRevenue ?? 0,
      freshnessDays,
    });

    await prisma.shop.update({
      where: { id: s.id },
      data: { trendScore: score, lastSeenAt: new Date() },
    });
  }

  return { shopsScored: shops.length };
}

