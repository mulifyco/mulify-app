import prisma from "@/lib/prisma";

export interface ListCollectionsOptions {
  search?: string;
  storeId?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  page?: number;
  pageSize?: number;
}

export const CollectionRepository = {
  async findById(id: string) {
    return prisma.collection.findUnique({
      where: { id },
      include: {
        store: true,
        confidenceScores: true,
        entityLinks: { include: { rawRecord: { select: { id: true, externalId: true, status: true } } } },
        products: {
          take: 100,
          include: { product: { select: { id: true, title: true, handle: true, url: true, featuredImage: true } } },
        },
        _count: { select: { products: true } },
      },
    });
  },

  async list(options: ListCollectionsOptions = {}) {
    const { search, storeId, confidenceMin, confidenceMax, page = 1, pageSize = 25 } = options;
    const skip = (page - 1) * pageSize;

    const scoreFilter =
      confidenceMin !== undefined || confidenceMax !== undefined
        ? {
            confidenceScores: {
              some: {
                ...(confidenceMin !== undefined ? { overallScore: { gte: confidenceMin } } : {}),
                ...(confidenceMax !== undefined ? { overallScore: { lte: confidenceMax } } : {}),
              },
            },
          }
        : {};

    const where = {
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { handle: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(storeId ? { storeId } : {}),
      ...scoreFilter,
    };

    const [data, total] = await Promise.all([
      prisma.collection.findMany({
        where,
        include: {
          store: { select: { id: true, domain: true, name: true } },
          confidenceScores: true,
          _count: { select: { products: true } },
        },
        orderBy: { firstSeenAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.collection.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },
};
