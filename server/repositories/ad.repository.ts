import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface ListAdsOptions {
  search?: string;
  isActive?: boolean;
  pageId?: string;
  confidenceMin?: number;
  confidenceMax?: number;
  /** true = has destination or canonical URL; false = missing both */
  hasLandingUrl?: boolean;
  /** Entity graph: linked normalized STORE */
  linkedStore?: boolean;
  firstSeenAfter?: Date;
  firstSeenBefore?: Date;
  lastSeenBefore?: Date;
  /** Inactive ads not seen since this many days */
  staleInactive?: boolean;
  /** Only ads whose canonicalUrl appears on another ad */
  duplicateCanonicalOnly?: boolean;
  page?: number;
  pageSize?: number;
  orderBy?: "firstSeenAt" | "lastSeenAt" | "startDate";
  order?: "asc" | "desc";
}

async function duplicateCanonicalUrls(): Promise<string[]> {
  const groups = await prisma.ad.groupBy({
    by: ["canonicalUrl"],
    where: { NOT: { canonicalUrl: null } },
    _count: { _all: true },
  });
  return groups
    .filter((g) => g.canonicalUrl && g._count._all > 1)
    .map((g) => g.canonicalUrl as string)
    .slice(0, 400);
}

export const AdRepository = {
  async findById(id: string) {
    return prisma.ad.findUnique({
      where: { id },
      include: {
        confidenceScores: true,
        entityLinks: { include: { rawRecord: true, store: { select: { id: true, domain: true } } } },
        landingPages: { take: 20, orderBy: { firstSeenAt: "desc" } },
      },
    });
  },

  async list(options: ListAdsOptions = {}) {
    const {
      search,
      isActive,
      pageId,
      confidenceMin,
      confidenceMax,
      hasLandingUrl,
      linkedStore,
      firstSeenAfter,
      firstSeenBefore,
      lastSeenBefore,
      staleInactive,
      duplicateCanonicalOnly,
      page = 1,
      pageSize = 20,
      orderBy = "firstSeenAt",
      order = "desc",
    } = options;

    const skip = (page - 1) * pageSize;

    let dupUrls: string[] | undefined;
    if (duplicateCanonicalOnly) {
      dupUrls = await duplicateCanonicalUrls();
      if (!dupUrls.length) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 };
      }
    }

    const where: Prisma.AdWhereInput = {
      ...(search
        ? {
            OR: [
              { adText: { contains: search, mode: "insensitive" as const } },
              { adTitle: { contains: search, mode: "insensitive" as const } },
              { pageName: { contains: search, mode: "insensitive" as const } },
              { pageId: { contains: search, mode: "insensitive" as const } },
              { externalId: { contains: search, mode: "insensitive" as const } },
              { id: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(pageId ? { pageId } : {}),
      ...(hasLandingUrl === true
        ? {
            OR: [{ destinationUrl: { not: null } }, { canonicalUrl: { not: null } }],
          }
        : {}),
      ...(hasLandingUrl === false
        ? {
            AND: [{ destinationUrl: null }, { canonicalUrl: null }],
          }
        : {}),
      ...(linkedStore === true ? { entityLinks: { some: { entityType: "STORE" } } } : {}),
      ...(linkedStore === false ? { entityLinks: { none: { entityType: "STORE" } } } : {}),
      ...(firstSeenAfter || firstSeenBefore
        ? {
            firstSeenAt: {
              ...(firstSeenAfter ? { gte: firstSeenAfter } : {}),
              ...(firstSeenBefore ? { lte: firstSeenBefore } : {}),
            },
          }
        : {}),
      ...(lastSeenBefore ? { lastSeenAt: { lte: lastSeenBefore } } : {}),
      ...(staleInactive
        ? {
            isActive: false,
            lastSeenAt: { lt: new Date(Date.now() - 60 * 86400000) },
          }
        : {}),
      ...(duplicateCanonicalOnly && dupUrls?.length ? { canonicalUrl: { in: dupUrls } } : {}),
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
      prisma.ad.findMany({
        where,
        include: {
          confidenceScores: true,
          landingPages: { take: 3, select: { id: true, domain: true, url: true } },
          entityLinks: {
            where: { entityType: "STORE" },
            take: 2,
            include: { store: { select: { id: true, domain: true } } },
          },
        },
        orderBy: { [orderBy]: order },
        skip,
        take: pageSize,
      }),
      prisma.ad.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async getStats() {
    const [total, active, withCanonical, withDestination, lowConfidence] = await Promise.all([
      prisma.ad.count(),
      prisma.ad.count({ where: { isActive: true } }),
      prisma.ad.count({ where: { NOT: { canonicalUrl: null } } }),
      prisma.ad.count({ where: { NOT: { destinationUrl: null } } }),
      prisma.ad.count({
        where: {
          confidenceScores: { some: { level: "LOW" } },
        },
      }),
    ]);
    return {
      total,
      active,
      withLandingPage: withCanonical,
      withCanonical,
      withDestination,
      lowConfidence,
    };
  },

  async getRelatedJobsForAd(adId: string, take = 20) {
    const links = await prisma.entityLink.findMany({
      where: { adId },
      select: { rawRecord: { select: { jobId: true } } },
    });
    const jobIds = [
      ...new Set(
        links.map((l) => l.rawRecord?.jobId).filter((x): x is string => Boolean(x))
      ),
    ];
    if (!jobIds.length) return [];
    return prisma.ingestionJob.findMany({
      where: { id: { in: jobIds } },
      orderBy: { createdAt: "desc" },
      take,
      include: { source: { select: { id: true, name: true, type: true } } },
    });
  },
};
