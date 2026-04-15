import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { DashboardStats } from "@/types";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";
import { sourceDb } from "@/lib/prisma-source-delegate";

function n(v: bigint | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "bigint" ? Number(v) : v;
}

/**
 * Single round-trip for entity counts + 24h job stats (replaces ~18 parallel count queries).
 */
async function loadDashboardCountRow(dayAgo: Date): Promise<{
  totalAds: number;
  totalStores: number;
  totalProducts: number;
  totalCollections: number;
  totalLandingPages: number;
  totalRawRecords: number;
  totalSources: number;
  activeSources: number;
  sourcesInError: number;
  activeJobs: number;
  failedJobs24h: number;
  partialJobs24h: number;
  rawFailed: number;
  rawNormalized: number;
  confHigh: number;
  confMed: number;
  confLow: number;
  entitiesLowConfidence: number;
  totalShops: number;
  avgTrendScore: number | undefined;
  newStores24h: number;
  newProducts24h: number;
  newCollections24h: number;
  storefrontsEnriched24h: number;
  newCreatives24h: number;
  newProductClusters24h: number;
  freshSources6h: number;
  recycledDomains24h: number;
}> {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const [row] = await prisma.$queryRaw<
    Array<{
      totalAds: bigint;
      totalStores: bigint;
      totalProducts: bigint;
      totalCollections: bigint;
      totalLandingPages: bigint;
      totalRawRecords: bigint;
      totalSources: bigint;
      activeSources: bigint;
      sourcesInError: bigint;
      activeJobs: bigint;
      failedJobs24h: bigint;
      partialJobs24h: bigint;
      rawFailed: bigint;
      rawNormalized: bigint;
      confHigh: bigint;
      confMed: bigint;
      confLow: bigint;
      entitiesLowConfidence: bigint;
      totalShops: bigint;
      avgTrend: number | null;
      newStores24h: bigint;
      newProducts24h: bigint;
      newCollections24h: bigint;
      storefrontsEnriched24h: bigint;
      newCreatives24h: bigint;
      newProductClusters24h: bigint;
      freshSources6h: bigint;
      recycledDomains24h: bigint;
    }>
  >(Prisma.sql`
    SELECT
      (SELECT COUNT(*)::bigint FROM "Ad") AS "totalAds",
      (SELECT COUNT(*)::bigint FROM "Store") AS "totalStores",
      (SELECT COUNT(*)::bigint FROM "Product") AS "totalProducts",
      (SELECT COUNT(*)::bigint FROM "Collection") AS "totalCollections",
      (SELECT COUNT(*)::bigint FROM "LandingPage") AS "totalLandingPages",
      (SELECT COUNT(*)::bigint FROM "RawRecord") AS "totalRawRecords",
      (SELECT COUNT(*)::bigint FROM "Source") AS "totalSources",
      (SELECT COUNT(*)::bigint FROM "Source" WHERE status = 'ACTIVE'::"SourceStatus") AS "activeSources",
      (SELECT COUNT(*)::bigint FROM "Source" WHERE status = 'ERROR'::"SourceStatus") AS "sourcesInError",
      (SELECT COUNT(*)::bigint FROM "IngestionJob" WHERE status = 'RUNNING'::"JobStatus") AS "activeJobs",
      (SELECT COUNT(*)::bigint FROM "IngestionJob" WHERE status = 'FAILED'::"JobStatus" AND "createdAt" >= ${dayAgo}) AS "failedJobs24h",
      (SELECT COUNT(*)::bigint FROM "IngestionJob" WHERE status = 'PARTIAL'::"JobStatus" AND "createdAt" >= ${dayAgo}) AS "partialJobs24h",
      (SELECT COUNT(*)::bigint FROM "RawRecord" WHERE status = 'FAILED'::"RecordStatus") AS "rawFailed",
      (SELECT COUNT(*)::bigint FROM "RawRecord" WHERE status = 'NORMALIZED'::"RecordStatus") AS "rawNormalized",
      (SELECT COUNT(*)::bigint FROM "ConfidenceScore" WHERE "entityType" = 'AD'::"EntityType" AND level = 'HIGH'::"ConfidenceLevel") AS "confHigh",
      (SELECT COUNT(*)::bigint FROM "ConfidenceScore" WHERE "entityType" = 'AD'::"EntityType" AND level = 'MEDIUM'::"ConfidenceLevel") AS "confMed",
      (SELECT COUNT(*)::bigint FROM "ConfidenceScore" WHERE "entityType" = 'AD'::"EntityType" AND level = 'LOW'::"ConfidenceLevel") AS "confLow",
      (SELECT COUNT(*)::bigint FROM "ConfidenceScore" WHERE level = 'LOW'::"ConfidenceLevel") AS "entitiesLowConfidence",
      (SELECT COUNT(*)::bigint FROM "Shop") AS "totalShops",
      (SELECT AVG("trendScore")::float FROM "Shop") AS "avgTrend",
      (SELECT COUNT(*)::bigint FROM "Store" WHERE "createdAt" >= ${dayAgo}) AS "newStores24h",
      (SELECT COUNT(*)::bigint FROM "Product" WHERE "createdAt" >= ${dayAgo}) AS "newProducts24h",
      (SELECT COUNT(*)::bigint FROM "Collection" WHERE "createdAt" >= ${dayAgo}) AS "newCollections24h",
      (SELECT COUNT(*)::bigint FROM "Store" WHERE "createdAt" >= ${dayAgo} OR "updatedAt" >= ${dayAgo}) AS "storefrontsEnriched24h",
      (SELECT COUNT(*)::bigint FROM "CreativeCluster" WHERE "createdAt" >= ${dayAgo}) AS "newCreatives24h",
      (SELECT COUNT(*)::bigint FROM "ProductCluster" WHERE "createdAt" >= ${dayAgo}) AS "newProductClusters24h",
      (SELECT COUNT(*)::bigint FROM "Source" WHERE "lastSuccessAt" >= ${sixHoursAgo}) AS "freshSources6h",
      (SELECT COUNT(*)::bigint FROM "DiscoveryCandidate" WHERE "createdAt" >= ${dayAgo} AND ("sourceTypeHint" LIKE 'FEEDBACK_%' OR "sourceTypeHint" IN ('COMPARE','COMPARE_RIVAL'))) AS "recycledDomains24h"
  `);

  if (!row) {
    return {
      totalAds: 0,
      totalStores: 0,
      totalProducts: 0,
      totalCollections: 0,
      totalLandingPages: 0,
      totalRawRecords: 0,
      totalSources: 0,
      activeSources: 0,
      sourcesInError: 0,
      activeJobs: 0,
      failedJobs24h: 0,
      partialJobs24h: 0,
      rawFailed: 0,
      rawNormalized: 0,
      confHigh: 0,
      confMed: 0,
      confLow: 0,
      entitiesLowConfidence: 0,
      totalShops: 0,
      avgTrendScore: undefined,
      newStores24h: 0,
      newProducts24h: 0,
      newCollections24h: 0,
      storefrontsEnriched24h: 0,
      newCreatives24h: 0,
      newProductClusters24h: 0,
      freshSources6h: 0,
      recycledDomains24h: 0,
    };
  }

  return {
    totalAds: n(row.totalAds),
    totalStores: n(row.totalStores),
    totalProducts: n(row.totalProducts),
    totalCollections: n(row.totalCollections),
    totalLandingPages: n(row.totalLandingPages),
    totalRawRecords: n(row.totalRawRecords),
    totalSources: n(row.totalSources),
    activeSources: n(row.activeSources),
    sourcesInError: n(row.sourcesInError),
    activeJobs: n(row.activeJobs),
    failedJobs24h: n(row.failedJobs24h),
    partialJobs24h: n(row.partialJobs24h),
    rawFailed: n(row.rawFailed),
    rawNormalized: n(row.rawNormalized),
    confHigh: n(row.confHigh),
    confMed: n(row.confMed),
    confLow: n(row.confLow),
    entitiesLowConfidence: n(row.entitiesLowConfidence),
    totalShops: n(row.totalShops),
    avgTrendScore: row.avgTrend != null && Number.isFinite(row.avgTrend) ? row.avgTrend : undefined,
    newStores24h: n(row.newStores24h),
    newProducts24h: n(row.newProducts24h),
    newCollections24h: n(row.newCollections24h),
    storefrontsEnriched24h: n(row.storefrontsEnriched24h),
    newCreatives24h: n(row.newCreatives24h),
    newProductClusters24h: n(row.newProductClusters24h),
    freshSources6h: n(row.freshSources6h),
    recycledDomains24h: n(row.recycledDomains24h),
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [counts, lastSyncRaw, recentJobsRaw, creativeDepthJob, hookIntelJob, tickJob, refreshJob, freshSources1h, staleSources24h, boardsRefreshed24h] =
    await Promise.all([
    loadDashboardCountRow(dayAgo).catch(async () => {
      // Fallback if raw SQL fails (enum drift / non-Postgres) — preserve behavior.
      const d = dayAgo;
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
        entitiesLowConfidence,
        totalShops,
        avgTrendRows,
        newStores24h,
        newProducts24h,
        newCollections24h,
        storefrontsEnriched24h,
        newCreatives24h,
        newProductClusters24h,
        freshSources6h,
        recycledDomains24h,
      ] = await Promise.all([
        prisma.ad.count(),
        prisma.store.count(),
        prisma.product.count(),
        prisma.collection.count(),
        prisma.landingPage.count(),
        prisma.rawRecord.count(),
        sourceDb().count(),
        sourceDb().count({ where: { status: "ACTIVE" } }),
        sourceDb().count({ where: { status: "ERROR" } }),
        prisma.ingestionJob.count({ where: { status: "RUNNING" } }),
        prisma.ingestionJob.count({ where: { status: "FAILED", createdAt: { gte: d } } }),
        prisma.ingestionJob.count({ where: { status: "PARTIAL", createdAt: { gte: d } } }),
        prisma.rawRecord.count({ where: { status: "FAILED" } }),
        prisma.rawRecord.count({ where: { status: "NORMALIZED" } }),
        prisma.confidenceScore.count({ where: { entityType: "AD", level: "HIGH" } }),
        prisma.confidenceScore.count({ where: { entityType: "AD", level: "MEDIUM" } }),
        prisma.confidenceScore.count({ where: { entityType: "AD", level: "LOW" } }),
        prisma.confidenceScore.count({ where: { level: "LOW" } }),
        prisma.shop.count().catch(() => 0),
        prisma.$queryRaw<{ avg: number | null }[]>`
          SELECT AVG("trendScore")::float AS avg FROM "Shop"
        `.catch(() => [{ avg: null }]),
        prisma.store.count({ where: { createdAt: { gte: d } } }).catch(() => 0),
        prisma.product.count({ where: { createdAt: { gte: d } } }).catch(() => 0),
        prisma.collection.count({ where: { createdAt: { gte: d } } }).catch(() => 0),
        prisma.store.count({ where: { OR: [{ createdAt: { gte: d } }, { updatedAt: { gte: d } }] } }).catch(() => 0),
        creativeClusterDb().count({ where: { createdAt: { gte: d } } }).catch(() => 0),
        prisma.productCluster.count({ where: { createdAt: { gte: d } } }).catch(() => 0),
        sourceDb().count({ where: { lastSuccessAt: { gte: sixHoursAgo } } }).catch(() => 0),
        prisma.discoveryCandidate
          .count({
            where: {
              createdAt: { gte: d },
              OR: [{ sourceTypeHint: { startsWith: "FEEDBACK_" } }, { sourceTypeHint: { in: ["COMPARE", "COMPARE_RIVAL"] } }],
            },
          })
          .catch(() => 0),
      ]);
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
        rawFailed,
        rawNormalized,
        confHigh,
        confMed,
        confLow,
        entitiesLowConfidence,
        totalShops,
        avgTrendScore: avgTrendRows[0]?.avg ?? undefined,
        newStores24h,
        newProducts24h,
        newCollections24h,
        storefrontsEnriched24h,
        newCreatives24h,
        newProductClusters24h,
        freshSources6h,
        recycledDomains24h,
      };
    }),
    sourceDb().findFirst({
      where: { lastSyncAt: { not: null } },
      orderBy: { lastSyncAt: "desc" },
      select: { lastSyncAt: true },
    }),
    prisma.ingestionJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        sourceId: true,
        status: true,
        triggeredBy: true,
        startedAt: true,
        completedAt: true,
        totalFetched: true,
        totalNormalized: true,
        totalFailed: true,
        createdAt: true,
        source: { select: { id: true, name: true, type: true } },
      },
    }),
    prisma.scraperJob
      .findFirst({
        where: { type: "creative_depth_signals", status: "SUCCESS", finishedAt: { gte: dayAgo } },
        orderBy: { finishedAt: "desc" },
        select: { payload: true },
      })
      .catch(() => null),
    prisma.scraperJob
      .findFirst({
        where: { type: "hook_intelligence_signals", status: "SUCCESS", finishedAt: { gte: dayAgo } },
        orderBy: { finishedAt: "desc" },
        select: { payload: true },
      })
      .catch(() => null),
    prisma.scraperJob
      .findFirst({
        where: { type: "worker_tick", status: "SUCCESS" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      })
      .catch(() => null),
    prisma.scraperJob
      .findFirst({
        where: { type: "refresh_sources", status: "SUCCESS" },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      })
      .catch(() => null),
    sourceDb().count({ where: { lastSuccessAt: { gte: oneHourAgo } } }).catch(() => 0),
    sourceDb()
      .count({
        where: {
          status: { in: ["ACTIVE", "PENDING"] },
          OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: dayAgo } }],
        },
      })
      .catch(() => 0),
    prisma.scraperJob.count({ where: { type: "evaluate_saved_board_filters", status: "SUCCESS", finishedAt: { gte: dayAgo } } }).catch(() => 0),
  ]);

  const lastSync = lastSyncRaw as { lastSyncAt: Date | null } | null;

  const recentJobs = recentJobsRaw.map((job) => ({
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

  const depthPayload = (creativeDepthJob?.payload ?? null) as Record<string, unknown> | null;
  const creativeBursts24h = typeof depthPayload?.creativeBurstsDetected24h === "number" ? depthPayload.creativeBurstsDetected24h : 0;
  const repeatedHooks24h = typeof depthPayload?.repeatedHooks24h === "number" ? depthPayload.repeatedHooks24h : 0;

  const hookPayload = (hookIntelJob?.payload ?? null) as Record<string, unknown> | null;
  const topWinningHooks24h = Array.isArray(hookPayload?.topWinningHooks24h)
    ? (hookPayload!.topWinningHooks24h as any[])
        .filter((x) => x && typeof x.canonicalHook === "string" && typeof x.angleType === "string" && typeof x.mentions === "number")
        .slice(0, 8)
        .map((x) => ({
          canonicalHook: String(x.canonicalHook),
          angleType: String(x.angleType),
          mentions: Number(x.mentions),
          storeCount: typeof x.storeCount === "number" ? Number(x.storeCount) : 0,
          platformMentions: (x.platformMentions && typeof x.platformMentions === "object" ? x.platformMentions : {}) as Record<string, number>,
        }))
    : [];
  const fastestRisingAngle24h =
    Array.isArray(hookPayload?.topAngleCategories24h) && (hookPayload!.topAngleCategories24h as any[])?.[0]?.angleType
      ? String((hookPayload!.topAngleCategories24h as any[])[0].angleType)
      : undefined;
  const crossoverWinnerHooks24h = topWinningHooks24h
    .filter((h) => Object.keys(h.platformMentions ?? {}).length >= 2)
    .slice(0, 5)
    .map((h) => ({ canonicalHook: h.canonicalHook, mentions: h.mentions }));

  return {
    totalAds: counts.totalAds,
    totalStores: counts.totalStores,
    totalProducts: counts.totalProducts,
    totalCollections: counts.totalCollections,
    totalLandingPages: counts.totalLandingPages,
    totalRawRecords: counts.totalRawRecords,
    totalSources: counts.totalSources,
    activeSources: counts.activeSources,
    sourcesInError: counts.sourcesInError,
    activeJobs: counts.activeJobs,
    failedJobs24h: counts.failedJobs24h,
    partialJobs24h: counts.partialJobs24h,
    rawRecordsFailed: counts.rawFailed,
    rawRecordsNormalized: counts.rawNormalized,
    entitiesLowConfidence: counts.entitiesLowConfidence,
    confidenceAds: {
      high: counts.confHigh,
      medium: counts.confMed,
      low: counts.confLow,
    },
    totalShops: counts.totalShops,
    avgTrendScore: counts.avgTrendScore,
    newStores24h: counts.newStores24h,
    newProducts24h: counts.newProducts24h,
    newCollections24h: counts.newCollections24h,
    storefrontsEnriched24h: counts.storefrontsEnriched24h,
    newCreatives24h: counts.newCreatives24h,
    newProductClusters24h: counts.newProductClusters24h,
    freshSources6h: counts.freshSources6h,
    recycledDomains24h: counts.recycledDomains24h,
    creativeBursts24h,
    repeatedHooks24h,
    topWinningHooks24h: topWinningHooks24h.length ? topWinningHooks24h : undefined,
    fastestRisingAngle24h,
    crossoverWinnerHooks24h: crossoverWinnerHooks24h.length ? crossoverWinnerHooks24h : undefined,
    lastWorkerTickAt: tickJob?.finishedAt ?? undefined,
    lastSuccessfulRefreshAt: refreshJob?.finishedAt ?? undefined,
    freshSources1h,
    staleSources24h,
    boardsRefreshed24h,
    lastSyncAt: lastSync?.lastSyncAt ?? undefined,
    recentJobs,
  };
}
