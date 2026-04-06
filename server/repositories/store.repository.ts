import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface ListStoresOptions {
  search?: string;
  platform?: string;
  country?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  updatedAfter?: Date;
  hasProducts?: boolean;
  /** lastSeenAt older than N days */
  staleDays?: number;
  /** Minimum product count (catalog size) */
  minProducts?: number;
  page?: number;
  pageSize?: number;
}

export type StoreListRow = Awaited<ReturnType<typeof StoreRepository.list>>["data"][number];

async function storeIdsWithMinProducts(min: number): Promise<string[]> {
  if (min <= 0) return [];
  const rows = await prisma.$queryRaw<{ storeId: string }[]>(
    Prisma.sql`
      SELECT "storeId" FROM "Product"
      GROUP BY "storeId"
      HAVING COUNT(*)::int >= ${min}
    `
  );
  return rows.map((r) => r.storeId);
}

export const StoreRepository = {
  async getCatalogProminenceStats(storeId: string) {
    const [total, scored, heroCount, featuredCount, avgRows] = await Promise.all([
      prisma.product.count({ where: { storeId } }),
      prisma.product.count({ where: { storeId, prominenceScore: { not: null } } }),
      prisma.product.count({ where: { storeId, prominenceLevel: "HERO" } }),
      prisma.product.count({ where: { storeId, prominenceLevel: "FEATURED" } }),
      prisma.$queryRaw<{ avg: number | null }[]>(
        Prisma.sql`
          SELECT AVG("prominenceScore")::float AS avg
          FROM "Product"
          WHERE "storeId" = ${storeId} AND "prominenceScore" IS NOT NULL
        `
      ),
    ]);
    const rawAvg = avgRows[0]?.avg ?? null;
    const avgProminence =
      rawAvg != null && !Number.isNaN(rawAvg) ? Math.round(rawAvg * 10) / 10 : null;
    return {
      avgProminence,
      heroCount,
      featuredCount,
      productsWithProminence: scored,
      productTotal: total,
    };
  },

  async findById(id: string) {
    return prisma.store.findUnique({
      where: { id },
      include: {
        _count: { select: { products: true, collections: true } },
        confidenceScores: true,
        entityLinks: {
          include: { rawRecord: { select: { id: true, externalId: true, status: true } } },
        },
      },
    });
  },

  async findByDomain(domain: string) {
    return prisma.store.findUnique({
      where: { domain },
      include: {
        _count: { select: { products: true, collections: true } },
        confidenceScores: true,
      },
    });
  },

  async list(options: ListStoresOptions = {}) {
    const {
      search,
      platform,
      country,
      confidenceMin,
      confidenceMax,
      updatedAfter,
      hasProducts,
      staleDays,
      minProducts,
      page = 1,
      pageSize = 20,
    } = options;
    const skip = (page - 1) * pageSize;

    let minProductStoreIds: string[] | undefined;
    if (minProducts !== undefined && minProducts > 0) {
      minProductStoreIds = await storeIdsWithMinProducts(minProducts);
      if (!minProductStoreIds.length) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }
    }

    const where = {
      ...(search
        ? {
            OR: [
              { domain: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(platform ? { platform } : {}),
      ...(country ? { country } : {}),
      ...(updatedAfter ? { lastSeenAt: { gte: updatedAfter } } : {}),
      ...(staleDays !== undefined
        ? { lastSeenAt: { lt: new Date(Date.now() - staleDays * 86400000) } }
        : {}),
      ...(hasProducts === true ? { products: { some: {} } } : {}),
      ...(hasProducts === false ? { products: { none: {} } } : {}),
      ...(minProductStoreIds?.length ? { id: { in: minProductStoreIds } } : {}),
      ...((confidenceMin !== undefined || confidenceMax !== undefined) && {
        confidenceScores: {
          some: {
            ...(confidenceMin !== undefined ? { overallScore: { gte: confidenceMin } } : {}),
            ...(confidenceMax !== undefined ? { overallScore: { lte: confidenceMax } } : {}),
          },
        },
      }),
    };

    const [rawData, total, lpCounts] = await Promise.all([
      prisma.store.findMany({
        where,
        include: {
          _count: { select: { products: true, collections: true } },
          confidenceScores: true,
        },
        orderBy: { firstSeenAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.store.count({ where }),
      prisma.$queryRaw<{ storeId: string; c: bigint }[]>`
        SELECT "storeId", COUNT(DISTINCT "landingPageId")::int AS c
        FROM "EntityLink"
        WHERE "storeId" IS NOT NULL AND "landingPageId" IS NOT NULL
        GROUP BY "storeId"
      `,
    ]);

    const lpMap = new Map(lpCounts.map((r) => [r.storeId, Number(r.c)]));

    const data = rawData.map((s) => ({
      ...s,
      landingPageLinkCount: lpMap.get(s.id) ?? 0,
    }));

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async getLandingPageLinks(storeId: string, take = 40) {
    const lps = await prisma.landingPage.findMany({
      where: { entityLinks: { some: { storeId } } },
      orderBy: { lastSeenAt: "desc" },
      take,
      select: { id: true, url: true, domain: true, title: true },
    });
    return lps.map((lp) => ({
      id: lp.id,
      entityType: "LANDING_PAGE" as const,
      entityId: lp.id,
      storeId,
      landingPageId: lp.id,
      landingPage: lp,
    }));
  },

  async getRecentCollections(storeId: string, take = 25) {
    return prisma.collection.findMany({
      where: { storeId },
      orderBy: { lastSeenAt: "desc" },
      take,
      select: { id: true, title: true, handle: true, _count: { select: { products: true } } },
    });
  },

  async getWithProducts(id: string, productPage = 1, productPageSize = 50) {
    const skip = (productPage - 1) * productPageSize;

    const [store, products, productTotal] = await Promise.all([
      prisma.store.findUnique({
        where: { id },
        include: {
          _count: { select: { products: true, collections: true } },
          confidenceScores: true,
        },
      }),
      prisma.product.findMany({
        where: { storeId: id },
        orderBy: { firstSeenAt: "desc" },
        skip,
        take: productPageSize,
      }),
      prisma.product.count({ where: { storeId: id } }),
    ]);

    return {
      store,
      products: {
        data: products,
        total: productTotal,
        page: productPage,
        pageSize: productPageSize,
        totalPages: Math.ceil(productTotal / productPageSize),
      },
    };
  },
};
