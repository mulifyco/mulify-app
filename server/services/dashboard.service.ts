import prisma from "@/lib/prisma";
import type { DashboardStats } from "@/types";

export async function getDashboardStats(): Promise<DashboardStats> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalAds,
    totalStores,
    totalProducts,
    totalCollections,
    totalLandingPages,
    totalRawRecords,
    totalSources,
    activeSources,
    sourcesInError,
    activeJobs,
    failedJobs24h,
    partialJobs24h,
    rawFailed,
    rawNormalized,
    confHigh,
    confMed,
    confLow,
    lastSync,
    recentJobsRaw,
  ] = await Promise.all([
    prisma.ad.count(),
    prisma.store.count(),
    prisma.product.count(),
    prisma.collection.count(),
    prisma.landingPage.count(),
    prisma.rawRecord.count(),
    prisma.source.count(),
    prisma.source.count({ where: { status: "ACTIVE" } }),
    prisma.source.count({ where: { status: "ERROR" } }),
    prisma.ingestionJob.count({ where: { status: "RUNNING" } }),
    prisma.ingestionJob.count({
      where: { status: "FAILED", createdAt: { gte: dayAgo } },
    }),
    prisma.ingestionJob.count({
      where: { status: "PARTIAL", createdAt: { gte: dayAgo } },
    }),
    prisma.rawRecord.count({ where: { status: "FAILED" } }),
    prisma.rawRecord.count({ where: { status: "NORMALIZED" } }),
    prisma.confidenceScore.count({ where: { entityType: "AD", level: "HIGH" } }),
    prisma.confidenceScore.count({ where: { entityType: "AD", level: "MEDIUM" } }),
    prisma.confidenceScore.count({ where: { entityType: "AD", level: "LOW" } }),
    prisma.source.findFirst({
      where: { lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: "desc" },
      select: { lastSyncAt: true },
    }),
    prisma.ingestionJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        source: { select: { id: true, name: true, type: true } },
      },
    }),
  ]);

  const entitiesLowConfidence = await prisma.confidenceScore.count({
    where: { level: "LOW" },
  });

  const recentJobs = recentJobsRaw.map((job: (typeof recentJobsRaw)[number]) => ({
    id: job.id,
    sourceId: job.sourceId,
    sourceName: job.source.name,
    sourceType: job.source.type,
    status: job.status,
    triggeredBy: job.triggeredBy,
    startedAt: job.startedAt ?? undefined,
    completedAt: job.completedAt ?? undefined,
    totalFetched: job.totalFetched,
    totalNormalized: job.totalNormalized,
    totalFailed: job.totalFailed,
    createdAt: job.createdAt,
  }));

  return {
    totalAds,
    totalStores,
    totalProducts,
    totalCollections,
    totalLandingPages,
    totalRawRecords,
    totalSources,
    activeSources,
    sourcesInError,
    activeJobs,
    failedJobs24h,
    partialJobs24h,
    rawRecordsFailed: rawFailed,
    rawRecordsNormalized: rawNormalized,
    entitiesLowConfidence,
    confidenceAds: {
      high: confHigh,
      medium: confMed,
      low: confLow,
    },
    lastSyncAt: lastSync?.lastSyncAt ?? undefined,
    recentJobs,
  };
}
