import prisma from "@/lib/prisma";

export interface ReadyToScaleRow {
  clusterId: string;
  title: string | null;
  primaryProductId: string | null;
  primaryProductTitle: string | null;
  readyToScaleScore: number;
  winningScore: number;
  saturationScore: number;
  storeCount: number;
  collectionCount: number;
  landingPageCount: number;
  linkedRawRecordCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  linkedCreativeClusterCount: number;
}

export const ReadyToScaleBoardRepository = {
  async list(options: { take?: number; minScore?: number }): Promise<ReadyToScaleRow[]> {
    const take = Math.max(1, Math.min(5000, options.take ?? 30));
    const minScore = options.minScore ?? 0;

    const clusters = await prisma.productCluster.findMany({
      where: { readyToScaleScore: { gte: minScore } },
      orderBy: [{ readyToScaleScore: "desc" }, { lastSeenAt: "desc" }],
      take,
      select: {
        id: true,
        title: true,
        readyToScaleScore: true,
        winningScore: true,
        saturationScore: true,
        storeCount: true,
        collectionCount: true,
        landingPageCount: true,
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
        readyToScaleScore: c.readyToScaleScore,
        winningScore: c.winningScore,
        saturationScore: c.saturationScore,
        storeCount: c.storeCount,
        collectionCount: c.collectionCount,
        landingPageCount: c.landingPageCount,
        linkedRawRecordCount: c.linkedRawRecordCount,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: c.lastSeenAt,
        linkedCreativeClusterCount: c.linkedCreativeClusterCount,
      };
    });
  },
};
