import prisma from "@/lib/prisma";

export interface ListLandingPagesOptions {
  search?: string;
  domain?: string;
  page?: number;
  pageSize?: number;
}

export type LandingPageListRow = Awaited<
  ReturnType<typeof LandingPageRepository.list>
>["data"][number];

export const LandingPageRepository = {
  async findById(id: string) {
    return prisma.landingPage.findUnique({
      where: { id },
      include: {
        ads: { select: { id: true, externalId: true, pageName: true, canonicalUrl: true } },
        entityLinks: {
          include: { rawRecord: { select: { id: true, externalId: true, entityType: true } } },
        },
        confidenceScores: true,
      },
    });
  },

  async list(options: ListLandingPagesOptions = {}) {
    const { search, domain, page = 1, pageSize = 25 } = options;
    const skip = (page - 1) * pageSize;

    const where = {
      ...(domain
        ? { domain: { contains: domain, mode: "insensitive" as const } }
        : {}),
      ...(search
        ? {
            OR: [
              { url: { contains: search, mode: "insensitive" as const } },
              { title: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.landingPage.findMany({
        where,
        include: {
          _count: { select: { ads: true, entityLinks: true } },
          entityLinks: { select: { entityType: true } },
          confidenceScores: true,
        },
        orderBy: { firstSeenAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.landingPage.count({ where }),
    ]);

    const data = rows.map((r: (typeof rows)[number]) => {
      const linkedProductCount = r.entityLinks.filter(
        (l: (typeof r.entityLinks)[number]) => l.entityType === "PRODUCT"
      ).length;
      const linkedStoreCount = r.entityLinks.filter(
        (l: (typeof r.entityLinks)[number]) => l.entityType === "STORE"
      ).length;
      const { entityLinks: _el, ...rest } = r;
      return { ...rest, linkedProductCount, linkedStoreCount };
    });

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },
};
