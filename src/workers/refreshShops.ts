import prisma from "@/src/lib/prisma";

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function clampFloat(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function jitterPct(maxPct: number): number {
  return (Math.random() * 2 - 1) * maxPct;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function refreshShopsJob(): Promise<{ shopsUpdated: number; metricsUpserted: number }> {
  const shops = await prisma.shop.findMany({
    select: {
      id: true,
      lastSeenAt: true,
      monthlyVisits: true,
      estimatedDailyRevenue: true,
      activeMetaAds: true,
    },
  });

  const today = startOfDay(new Date());
  let metricsUpserted = 0;

  for (const s of shops) {
    // If an external ads provider just confirmed this shop, avoid fighting its numbers too hard.
    const recentlySeen = s.lastSeenAt ? Date.now() - s.lastSeenAt.getTime() < 90_000 : false;
    const visits0 = s.monthlyVisits ?? 0;
    const rev0 = s.estimatedDailyRevenue ?? 0;

    const nextVisits = clampInt(visits0 * (1 + jitterPct(recentlySeen ? 0.01 : 0.03)), 0, 50_000_000);
    const nextRev = clampFloat(rev0 * (1 + jitterPct(recentlySeen ? 0.015 : 0.05)), 0, 5_000_000);

    // Prior metric for simple growth demo.
    const prev = await prisma.shopMetric.findFirst({
      where: { shopId: s.id, date: { lt: today } },
      orderBy: { date: "desc" },
      select: { monthlyVisits: true },
    });
    const prevVisits = prev?.monthlyVisits ?? visits0 ?? 1;
    const growth1m =
      prevVisits > 0 ? clampFloat((nextVisits - prevVisits) / prevVisits, -0.35, 0.35) : 0;

    await prisma.shop.update({
      where: { id: s.id },
      data: {
        monthlyVisits: nextVisits,
        estimatedDailyRevenue: nextRev,
        lastSeenAt: new Date(),
      },
    });

    await prisma.shopMetric.upsert({
      where: { shopId_date: { shopId: s.id, date: today } },
      create: {
        shopId: s.id,
        date: today,
        monthlyVisits: nextVisits,
        visitsGrowth1m: growth1m,
        estimatedDailyRevenue: nextRev,
        activeMetaAds: s.activeMetaAds ?? 0,
      },
      update: {
        monthlyVisits: nextVisits,
        visitsGrowth1m: growth1m,
        estimatedDailyRevenue: nextRev,
        activeMetaAds: s.activeMetaAds ?? 0,
      },
    });
    metricsUpserted++;
  }

  return { shopsUpdated: shops.length, metricsUpserted };
}

