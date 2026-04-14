import prisma from "@/lib/prisma";

export const CreativeClusterRepository = {
  async findForAd(adId: string) {
    const m = await prisma.creativeClusterMember.findUnique({
      where: { adId },
      include: { cluster: true },
    });
    return m?.cluster ?? null;
  },

  async listTrending(take = 50) {
    return prisma.creativeCluster.findMany({
      orderBy: [{ scaleScore: "desc" }, { lastSeenAt: "desc" }],
      take,
    });
  },

  async listForShop(shopId: string, take = 12) {
    const rows = await prisma.creativeClusterMember.findMany({
      where: { shopId },
      select: { clusterId: true },
      take: 500,
      orderBy: { updatedAt: "desc" },
    });
    const ids = [...new Set(rows.map((r) => r.clusterId))].slice(0, 160);
    if (!ids.length) return [];
    return prisma.creativeCluster.findMany({
      where: { id: { in: ids } },
      orderBy: [{ scaleScore: "desc" }, { lastSeenAt: "desc" }],
      take,
    });
  },

  async listForStoreDomain(domain: string, take = 12) {
    const shop = await prisma.shop.findUnique({ where: { domain }, select: { id: true } });
    if (!shop) return [];
    return this.listForShop(shop.id, take);
  },
};

