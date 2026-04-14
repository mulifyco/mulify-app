import prisma from "@/lib/prisma";

export interface SaturatedProductsRow {
  clusterId: string;
  title: string | null;
  primaryProductId: string | null;
  primaryProductTitle: string | null;
  saturatedScore: number;
  saturationScore: number;
  marketLeaderScore: number;
  storeCount: number;
  collectionCount: number;
  linkedCreativeClusterCount: number;
  linkedRawRecordCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  persistenceDays: number;
}

function persistenceDaysBetween(firstSeenAt: Date, lastSeenAt: Date): number {
  return (lastSeenAt.getTime() - firstSeenAt.getTime()) / 86400000;
}

export const SaturatedProductsBoardRepository = {
  async list(options: { take?: number; minScore?: number }): Promise<SaturatedProductsRow[]> {
    const take = Math.max(1, Math.min(5000, options.take ?? 30));
    const minScore = options.minScore ?? 0;
    const pool = Math.min(1500, Math.max(take * 8, 200));

    const clusters = await prisma.productCluster.findMany({
      where: { saturatedScore: { gte: minScore } },
      orderBy: [{ saturatedScore: "desc" }, { storeCount: "desc" }],
      take: pool,
      select: {
        id: true,
        title: true,
        saturatedScore: true,
        saturationScore: true,
        marketLeaderScore: true,
        storeCount: true,
        collectionCount: true,
        linkedCreativeClusterCount: true,
        linkedRawRecordCount: true,
        firstSeenAt: true,
        lastSeenAt: true,
        members: {
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: { productId: true, product: { select: { title: true } } },
        },
      },
    });

    clusters.sort((a, b) => {
      const ds = b.saturatedScore - a.saturatedScore;
      if (ds !== 0) return ds;
      const dst = b.storeCount - a.storeCount;
      if (dst !== 0) return dst;
      return (
        persistenceDaysBetween(b.firstSeenAt, b.lastSeenAt) -
        persistenceDaysBetween(a.firstSeenAt, a.lastSeenAt)
      );
    });

    const sliced = clusters.slice(0, take);

    return sliced.map((c) => {
      const m0 = c.members[0];
      const persistenceDays = persistenceDaysBetween(c.firstSeenAt, c.lastSeenAt);
      return {
        clusterId: c.id,
        title: c.title,
        primaryProductId: m0?.productId ?? null,
        primaryProductTitle: m0?.product?.title ?? null,
        saturatedScore: c.saturatedScore,
        saturationScore: c.saturationScore,
        marketLeaderScore: c.marketLeaderScore,
        storeCount: c.storeCount,
        collectionCount: c.collectionCount,
        linkedCreativeClusterCount: c.linkedCreativeClusterCount,
        linkedRawRecordCount: c.linkedRawRecordCount,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: c.lastSeenAt,
        persistenceDays,
      };
    });
  },
};
