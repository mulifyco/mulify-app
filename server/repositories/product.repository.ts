import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface ListProductsOptions {
  search?: string;
  storeId?: string;
  isAvailable?: boolean;
  vendor?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  hasPrice?: boolean;
  lastSeenAfter?: Date;
  hasCollections?: boolean;
  /** Same storeId+handle appears on multiple product rows */
  duplicateHandleOnly?: boolean;
  page?: number;
  pageSize?: number;
}

async function duplicateHandleKeys(): Promise<{ storeId: string; handle: string }[]> {
  const g = await prisma.product.groupBy({
    by: ["storeId", "handle"],
    _count: { _all: true },
  });
  return g
    .filter((x) => x._count._all > 1)
    .map((x) => ({ storeId: x.storeId, handle: x.handle }))
    .slice(0, 200);
}

export const ProductRepository = {
  async findById(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: {
        store: true,
        collectionMemberships: { include: { collection: true } },
        confidenceScores: true,
        entityLinks: { include: { rawRecord: true } },
        clusterMember: { include: { cluster: true } },
      },
    });
  },

  async countDuplicateHandlesForProduct(storeId: string, handle: string) {
    return prisma.product.count({ where: { storeId, handle } });
  },

  async list(options: ListProductsOptions = {}) {
    const {
      search,
      storeId,
      isAvailable,
      vendor,
      confidenceMin,
      confidenceMax,
      hasPrice,
      lastSeenAfter,
      hasCollections,
      duplicateHandleOnly,
      page = 1,
      pageSize = 20,
    } = options;
    const skip = (page - 1) * pageSize;

    let dupOr: Prisma.ProductWhereInput[] | undefined;
    if (duplicateHandleOnly) {
      const keys = await duplicateHandleKeys();
      if (!keys.length) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }
      dupOr = keys.map((k) => ({ storeId: k.storeId, handle: k.handle }));
    }

    const where: Prisma.ProductWhereInput = {
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { handle: { contains: search, mode: "insensitive" as const } },
              { vendor: { contains: search, mode: "insensitive" as const } },
              { id: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(storeId ? { storeId } : {}),
      ...(isAvailable !== undefined ? { isAvailable } : {}),
      ...(vendor ? { vendor: { contains: vendor, mode: "insensitive" as const } } : {}),
      ...(hasPrice === true ? { OR: [{ priceMin: { not: null } }, { priceMax: { not: null } }] } : {}),
      ...(hasPrice === false ? { AND: [{ priceMin: null }, { priceMax: null }] } : {}),
      ...(lastSeenAfter ? { lastSeenAt: { gte: lastSeenAfter } } : {}),
      ...(hasCollections === true ? { collectionMemberships: { some: {} } } : {}),
      ...(hasCollections === false ? { collectionMemberships: { none: {} } } : {}),
      ...(dupOr?.length ? { OR: dupOr } : {}),
      ...((confidenceMin !== undefined || confidenceMax !== undefined) && {
        confidenceScores: {
          some: {
            ...(confidenceMin !== undefined ? { overallScore: { gte: confidenceMin } } : {}),
            ...(confidenceMax !== undefined ? { overallScore: { lte: confidenceMax } } : {}),
          },
        },
      }),
    };

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          store: { select: { id: true, domain: true, name: true } },
          confidenceScores: true,
          clusterMember: { include: { cluster: true } },
          _count: { select: { collectionMemberships: true } },
        },
        orderBy: { firstSeenAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    let dupSet = new Set<string>();
    if (data.length) {
      const pairWhere: Prisma.ProductWhereInput = {
        OR: data.map((p) => ({ storeId: p.storeId, handle: p.handle })),
      };
      const counts = await prisma.product.groupBy({
        by: ["storeId", "handle"],
        where: pairWhere,
        _count: { _all: true },
      });
      dupSet = new Set(
        counts.filter((c) => c._count._all > 1).map((c) => `${c.storeId}:${c.handle}`)
      );
    }

    const enriched = data.map((p) => ({
      ...p,
      duplicateHandle: dupSet.has(`${p.storeId}:${p.handle}`),
    }));

    return { data: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },
};
