import prisma from "@/lib/prisma";

export interface MarketLeadersRow {
  clusterId: string;
  title: string | null;
  primaryProductId: string | null;
  primaryProductTitle: string | null;
  marketLeaderScore: number;
  readyToScaleScore: number;
  winningScore: number;
  saturationScore: number;
  storeCount: number;
  collectionCount: number;
  linkedRawRecordCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  linkedCreativeClusterCount: number;
}

export const MarketLeadersBoardRepository = {
  async list(options: { take?: number; minScore?: number }): Promise<MarketLeadersRow[]> {
    const take = Math.max(1, Math.min(5000, options.take ?? 30));
    const minScore = options.minScore ?? 0;

    const clusters = await prisma.productCluster.findMany({
      where: { marketLeaderScore: { gte: minScore } },
      orderBy: [{ marketLeaderScore: "desc" }, { storeCount: "desc" }, { lastSeenAt: "desc" }],
      take,
      select: {
        id: true,
        title: true,
        marketLeaderScore: true,
        readyToScaleScore: true,
        winningScore: true,
        saturationScore: true,
        storeCount: true,
        collectionCount: true,
        linkedRawRecordCount: true,
        firstSeenAt: true,
        lastSeenAt: true,
        linkedCreativeClusterCount: true,
        members: {
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: { productId: true, product: { select: { title: true } } },
        },
      },
    });

    return clusters.map((c) => {
      const m0 = c.members[0];
      return {
        clusterId: c.id,
        title: c.title,
        primaryProductId: m0?.productId ?? null,
        primaryProductTitle: m0?.product?.title ?? null,
        marketLeaderScore: c.marketLeaderScore,
        readyToScaleScore: c.readyToScaleScore,
        winningScore: c.winningScore,
        saturationScore: c.saturationScore,
        storeCount: c.storeCount,
        collectionCount: c.collectionCount,
        linkedRawRecordCount: c.linkedRawRecordCount,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: c.lastSeenAt,
        linkedCreativeClusterCount: c.linkedCreativeClusterCount,
      };
    });
  },
};
