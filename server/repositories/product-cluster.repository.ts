import type { ProductCluster } from "@prisma/client";
import prisma from "@/lib/prisma";

export const ProductClusterRepository = {
  async findByKey(key: string) {
    return prisma.productCluster.findUnique({
      where: { key },
      include: {
        members: {
          include: { product: { include: { store: { select: { id: true, domain: true } } } } },
          orderBy: { updatedAt: "desc" },
          take: 250,
        },
      },
    });
  },

  async findForProduct(productId: string) {
    const member = await prisma.productClusterMember.findUnique({
      where: { productId },
      include: { cluster: true },
    });
    return member?.cluster ?? null;
  },

  async listTrending(options?: { take?: number }) {
    const take = options?.take ?? 50;
    return prisma.productCluster.findMany({
      orderBy: [{ winningScore: "desc" }, { lastSeenAt: "desc" }],
      take,
    });
  },

  async listForStore(storeId: string, take = 12) {
    const rows = await prisma.productClusterMember.findMany({
      where: { storeId },
      select: { clusterId: true },
      take: 400,
      orderBy: { updatedAt: "desc" },
    });
    const ids = [...new Set(rows.map((r) => r.clusterId))].slice(0, 120);
    if (!ids.length) return [];
    return prisma.productCluster.findMany({
      where: { id: { in: ids } },
      orderBy: [{ winningScore: "desc" }, { lastSeenAt: "desc" }],
      take,
    });
  },

  async listForCollection(collectionId: string, take = 12): Promise<ProductCluster[]> {
    const productIds = await prisma.collectionProduct.findMany({
      where: { collectionId },
      select: { productId: true },
      take: 600,
    });
    if (!productIds.length) return [];

    const members = await prisma.productClusterMember.findMany({
      where: { productId: { in: productIds.map((p) => p.productId) } },
      select: { clusterId: true },
      take: 600,
    });
    const ids = [...new Set(members.map((m) => m.clusterId))].slice(0, 120);
    if (!ids.length) return [];

    return prisma.productCluster.findMany({
      where: { id: { in: ids } },
      orderBy: [{ winningScore: "desc" }, { lastSeenAt: "desc" }],
      take,
    });
  },
};

