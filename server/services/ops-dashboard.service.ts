import prisma from "@/lib/prisma";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";
import { reviewQueueItemDb } from "@/lib/prisma-review-queue-item-delegate";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

export type HealthBand = "HEALTHY" | "WARNING" | "CRITICAL";

export type OpsSourceHealthRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  errorCount: number;
  lastError: string | null;
  rawCount: number;
  candidatesDiscovered: number;
  jobs24hSucceeded: number;
  jobs24hFailed: number;
  lastJobStatus: string | null;
  lastJobAt: Date | null;
  emptyJobStreak: number;
  healthScore: number;
  band: HealthBand;
  reasons: string[];
  reliabilityStatus: string;
  consecutiveFailures: number;
  consecutiveEmptyRuns: number;
  cooldownUntil: Date | null;
  disabledReason: string | null;
  lastHealthyAt: Date | null;
};

function bandForScore(score: number): HealthBand {
  if (score >= 75) return "HEALTHY";
  if (score >= 45) return "WARNING";
  return "CRITICAL";
}

function recencyScore(dt: Date | null, goodHours: number, badHours: number): number {
  if (!dt) return 0;
  const ageH = (Date.now() - dt.getTime()) / 3_600_000;
  if (ageH <= goodHours) return 25;
  if (ageH >= badHours) return 0;
  const t = (badHours - ageH) / Math.max(1, badHours - goodHours);
  return Math.round(t * 25);
}

function computeHealthScore(input: {
  lastSuccessAt: Date | null;
  lastSyncAt: Date | null;
  errorCount: number;
  rawCount: number;
  candidatesDiscovered: number;
  emptyJobStreak: number;
  stalledHours: number;
}): { score: number; reasons: string[] } {
  let score = 50;
  const reasons: string[] = [];

  // Recency
  const sRec = recencyScore(input.lastSuccessAt, 6, 72);
  score += sRec;
  if (sRec >= 20) reasons.push("recent_success");
  else if (!input.lastSuccessAt) reasons.push("no_success_yet");

  // Error count penalty (best-effort)
  const errPenalty = clamp(input.errorCount * 6, 0, 30);
  score -= errPenalty;
  if (input.errorCount >= 3) reasons.push(`errors:${input.errorCount}`);

  // Raw evidence
  if (input.rawCount > 0) {
    score += input.rawCount >= 50 ? 14 : input.rawCount >= 10 ? 10 : 6;
    reasons.push(`raw:${input.rawCount}`);
  } else {
    score -= 8;
    reasons.push("no_raw_rows");
  }

  // Discovery production (candidate generation)
  if (input.candidatesDiscovered > 0) {
    score += input.candidatesDiscovered >= 10 ? 10 : 6;
    reasons.push(`candidates:${input.candidatesDiscovered}`);
  }

  // Empty sync penalty (streak)
  if (input.emptyJobStreak >= 2) {
    score -= input.emptyJobStreak >= 4 ? 20 : 12;
    reasons.push(`empty_streak:${input.emptyJobStreak}`);
  }

  // Stalled penalty based on lastSyncAt (not lastSuccessAt)
  if (!input.lastSyncAt) {
    score -= 10;
    reasons.push("never_synced");
  } else {
    const ageH = (Date.now() - input.lastSyncAt.getTime()) / 3_600_000;
    if (ageH >= input.stalledHours) {
      score -= 18;
      reasons.push(`stalled:${Math.round(ageH)}h`);
    }
  }

  return { score: clamp(score, 0, 100), reasons };
}

export async function buildOpsSourceHealth(): Promise<{
  summary: {
    totalActiveSources: number;
    totalDiscoveryCandidates: number;
    promotedThisWeek: number;
    successfulJobs24h: number;
    failedJobs24h: number;
    avgSourceHealthScore: number;
    stalledSourcesCount: number;
    autonomousDiscoveries24h: number;
    discoverSourcesTicks24h: number;
    autoPromotedSources24h: number;
    backlogCandidatesHigh: number;
    zeroInputCoverageHealth: number;
    zeroInputFillRatioPercent: number;
    storesDiscovered24h: number;
    productsExtracted24h: number;
    collectionsExtracted24h: number;
    storefrontsEnriched24h: number;
    creativesDiscovered24h: number;
    productClustersCreated24h: number;
    freshSources6h: number;
    feedbackSeeds24h: number;
    boostedFreshSources24h: number;
    winnerDomainsRecycled24h: number;
    compareRivalsRecycled24h: number;
    watchlistSpikesRecycled24h: number;
    newDomainsNormalized24h: number;
    falsePositivesSuppressed24h: number;
    boardCoverageRatioPercent: number;
    duplicateRawSuppressions24h: number;
    qualityReviewItemsOpened24h: number;
    lowConfidenceClustersOpen: number;
    entityLinkReviewOpen: number;
    canonicalStoreCollisionsOpen: number;
    reliabilityHealthy: number;
    reliabilityDegraded: number;
    reliabilityCoolingDown: number;
    reliabilityDisabled: number;
    staleRunningJobsRecovered24h: number;
    sourcesInEmptyStreak5Plus: number;
    avgConsecutiveFailures: number;
    avgConsecutiveEmptyRuns: number;
    sourceReliabilityAlertsOpen: number;
    newAdVariations24h: number;
    creativeBurstsDetected24h: number;
    repeatedHooks24h: number;
    lineageRichStores24h: number;
    platformCrossoverCreatives24h: number;
    canonicalHooks24h: number;
    crossoverHooks24h: number;
    hookOfferMatched24h: number;
    hookPersonaMatched24h: number;
    topAngleCategories24h: Array<{ angleType: string; hooks: number }>;
    lastWorkerTickAt: Date | null;
    lastSuccessfulRefreshAt: Date | null;
    freshSources1h: number;
    staleSources24h: number;
    boardsRefreshed24h: number;
  };
  worstSources: OpsSourceHealthRow[];
  bestSources: OpsSourceHealthRow[];
  failedJobs: Array<{
    id: string;
    sourceId: string;
    sourceName: string;
    sourceType: string;
    status: string;
    error: string | null;
    createdAt: Date;
  }>;
  topCandidates: Array<{
    id: string;
    domain: string;
    discoveryScore: number;
    rawEvidenceCount: number;
    discoveryReason: string;
    discoveredFromSourceId: string;
    createdAt: Date;
  }>;
  promotedSources: Array<{
    id: string;
    name: string;
    domain: string | null;
    type: string;
    createdAt: Date;
  }>;
  stalledSources: OpsSourceHealthRow[];
}> {
  const stalledHours = intFromEnv("OPS_STALLED_HOURS", 48);
  const since24h = hoursAgo(24);
  const since6h = hoursAgo(6);
  const weekAgo = hoursAgo(24 * 7);
  const discoveryCandidateModel = prisma.discoveryCandidate;

  const [
    autonomousDiscoveries24h,
    autoPromotedSources24h,
    backlogCandidatesHigh,
    storesDiscovered24h,
    productsExtracted24h,
    collectionsExtracted24h,
    storefrontsEnriched24h,
    creativesDiscovered24h,
    productClustersCreated24h,
    freshSources6h,
    feedbackSeeds24h,
    compareRivalsRecycled24h,
    newDomainsNormalized24h,
    falsePositivesSuppressed24h,
    clusterTotal,
    clusterBoardish,
  ] = await Promise.all([
    prisma.scraperJob
      .count({
        where: { type: "autonomous_discovery", status: "SUCCESS", finishedAt: { gte: since24h } },
      })
      .catch(() => 0),
    prisma.source
      .count({ where: { type: "SHOPIFY_DOMAIN", createdAt: { gte: since24h }, name: { startsWith: "AutoDiscovered:" } } })
      .catch(() => 0),
    discoveryCandidateModel?.count
      ? discoveryCandidateModel.count({ where: { isPromoted: false, discoveryScore: { gte: 70 } } }).catch(() => 0)
      : Promise.resolve(0),
    prisma.store.count({ where: { createdAt: { gte: since24h } } }).catch(() => 0),
    prisma.product.count({ where: { createdAt: { gte: since24h } } }).catch(() => 0),
    prisma.collection.count({ where: { createdAt: { gte: since24h } } }).catch(() => 0),
    prisma.store.count({ where: { OR: [{ createdAt: { gte: since24h } }, { updatedAt: { gte: since24h } }] } }).catch(() => 0),
    creativeClusterDb().count({ where: { createdAt: { gte: since24h } } }).catch(() => 0),
    prisma.productCluster.count({ where: { createdAt: { gte: since24h } } }).catch(() => 0),
    prisma.source.count({ where: { lastSuccessAt: { gte: since6h } } }).catch(() => 0),
    prisma.source
      .count({
        where: { type: "SHOPIFY_DOMAIN", createdAt: { gte: since24h }, name: { startsWith: "FeedbackSeed:" } },
      })
      .catch(() => 0),
    prisma.discoveryCandidate
      .count({ where: { createdAt: { gte: since24h }, sourceTypeHint: { in: ["COMPARE_RIVAL", "COMPARE"] } } })
      .catch(() => 0),
    prisma.source
      .count({
        where: {
          type: "SHOPIFY_DOMAIN",
          createdAt: { gte: since24h },
          OR: [{ name: { startsWith: "AutoDiscovered:" } }, { name: { startsWith: "Discovered:" } }],
        },
      })
      .catch(() => 0),
    (async () => {
      const jobs = await prisma.scraperJob
        .findMany({
          where: {
            type: { in: ["autonomous_discovery", "discover_sources"] },
            status: "SUCCESS",
            finishedAt: { gte: since24h },
          },
          select: { payload: true },
          take: 500,
        })
        .catch(() => [] as Array<{ payload: unknown }>);
      let n = 0;
      for (const j of jobs) {
        const p = j.payload as Record<string, unknown> | null;
        if (p && typeof p.falsePositivesSuppressed === "number") n += p.falsePositivesSuppressed;
      }
      return n;
    })(),
    prisma.productCluster.count().catch(() => 0),
    prisma.productCluster
      .count({
        where: {
          OR: [
            { readyToScaleScore: { gte: 8 } },
            { marketLeaderScore: { gte: 8 } },
            { earlyMoverScore: { gte: 8 } },
            { saturatedScore: { gte: 8 } },
          ],
        },
      })
      .catch(() => 0),
  ]);

  const [boostedFreshSources24h, winnerDomainsRecycled24h, watchlistSpikesRecycled24h] = await Promise.all([
    (async () => {
      const jobs = await prisma.scraperJob
        .findMany({
          where: { type: "refresh_sources", status: "SUCCESS", finishedAt: { gte: since24h } },
          select: { payload: true },
          take: 400,
        })
        .catch(() => [] as Array<{ payload: unknown }>);
      let n = 0;
      for (const j of jobs) {
        const p = j.payload as Record<string, unknown> | null;
        if (p && typeof p.boostedFreshSources === "number") n += p.boostedFreshSources;
      }
      return n;
    })(),
    prisma.discoveryCandidate
      .count({ where: { createdAt: { gte: since24h }, sourceTypeHint: "FEEDBACK_BOARD" } })
      .catch(() => 0),
    prisma.discoveryCandidate
      .count({ where: { createdAt: { gte: since24h }, sourceTypeHint: "FEEDBACK_WATCHLIST" } })
      .catch(() => 0),
  ]);

  const boardCoverageRatioPercent = clusterTotal > 0 ? clamp(Math.round((clusterBoardish / clusterTotal) * 100), 0, 100) : 0;
  const discoverTicks24h = await prisma.scraperJob
    .count({
      where: { type: "discover_sources", status: "SUCCESS", finishedAt: { gte: since24h } },
    })
    .catch(() => 0);

  const [
    duplicateRawSuppressions24h,
    qualityReviewItemsOpened24h,
    lowConfidenceClustersOpen,
    entityLinkReviewOpen,
    canonicalStoreCollisionsOpen,
    reliabilityHealthy,
    reliabilityDegraded,
    reliabilityCoolingDown,
    reliabilityDisabled,
    staleRunningJobsRecovered24h,
    sourcesInEmptyStreak5Plus,
    reliabilityFailureAvg,
    reliabilityEmptyAvg,
    sourceReliabilityAlertsOpen,
  ] = await Promise.all([
    prisma.rawRecord.count({ where: { lastDuplicateIngestAt: { gte: since24h } } }).catch(() => 0),
    reviewQueueItemDb()
      .count({
        where: {
          createdAt: { gte: since24h },
          type: {
            in: [
              "LOW_CONFIDENCE_PRODUCT_CLUSTER",
              "LOW_CONFIDENCE_CREATIVE_CLUSTER",
              "ENTITY_LINK_REVIEW",
            ],
          },
        },
      })
      .catch(() => 0),
    reviewQueueItemDb()
      .count({
        where: {
          status: { in: ["OPEN", "IN_REVIEW"] },
          type: { in: ["LOW_CONFIDENCE_PRODUCT_CLUSTER", "LOW_CONFIDENCE_CREATIVE_CLUSTER"] },
        },
      })
      .catch(() => 0),
    reviewQueueItemDb()
      .count({
        where: { status: { in: ["OPEN", "IN_REVIEW"] }, type: "ENTITY_LINK_REVIEW" },
      })
      .catch(() => 0),
    reviewQueueItemDb()
      .count({
        where: {
          status: { in: ["OPEN", "IN_REVIEW"] },
          type: "ENTITY_LINK_REVIEW",
          metadata: { path: ["kind"], equals: "STORE_CANONICAL_COLLISION" },
        },
      })
      .catch(() => 0),
    prisma.source.count({ where: { reliabilityStatus: "HEALTHY" } }).catch(() => 0),
    prisma.source.count({ where: { reliabilityStatus: "DEGRADED" } }).catch(() => 0),
    prisma.source.count({ where: { reliabilityStatus: "COOLING_DOWN" } }).catch(() => 0),
    prisma.source.count({ where: { reliabilityStatus: "DISABLED" } }).catch(() => 0),
    prisma.ingestionJob
      .count({
        where: {
          completedAt: { gte: since24h },
          error: "stale_running_job_swept",
        },
      })
      .catch(() => 0),
    prisma.source.count({ where: { consecutiveEmptyRuns: { gte: 5 } } }).catch(() => 0),
    prisma.source
      .aggregate({
        where: { status: "ACTIVE" },
        _avg: { consecutiveFailures: true },
      })
      .catch(() => ({ _avg: { consecutiveFailures: null as number | null } })),
    prisma.source
      .aggregate({
        where: { status: "ACTIVE" },
        _avg: { consecutiveEmptyRuns: true },
      })
      .catch(() => ({ _avg: { consecutiveEmptyRuns: null as number | null } })),
    reviewQueueItemDb()
      .count({
        where: { status: { in: ["OPEN", "IN_REVIEW"] }, type: "SOURCE_RELIABILITY_ALERT" },
      })
      .catch(() => 0),
  ]);

  const [newAdVariations24h, creativeBurstsDetected24h, repeatedHooks24h, lineageRichStores24h, platformCrossoverCreatives24h] =
    await (async () => {
      const jobs = await prisma.scraperJob
        .findMany({
          where: { type: "creative_depth_signals", status: "SUCCESS", finishedAt: { gte: since24h } },
          select: { payload: true },
          take: 120,
        })
        .catch(() => [] as Array<{ payload: unknown }>);
      let newAdVariations24h = 0;
      let creativeBurstsDetected24h = 0;
      let repeatedHooks24h = 0;
      let lineageRichStores24h = 0;
      let platformCrossoverCreatives24h = 0;
      for (const j of jobs) {
        const p = j.payload as Record<string, unknown> | null;
        if (!p) continue;
        if (typeof p.newAdVariations24h === "number") newAdVariations24h = Math.max(newAdVariations24h, p.newAdVariations24h);
        if (typeof p.creativeBurstsDetected24h === "number") creativeBurstsDetected24h = Math.max(creativeBurstsDetected24h, p.creativeBurstsDetected24h);
        if (typeof p.repeatedHooks24h === "number") repeatedHooks24h = Math.max(repeatedHooks24h, p.repeatedHooks24h);
        if (typeof p.lineageRichStores24h === "number") lineageRichStores24h = Math.max(lineageRichStores24h, p.lineageRichStores24h);
        if (typeof p.platformCrossoverCreatives24h === "number") platformCrossoverCreatives24h = Math.max(platformCrossoverCreatives24h, p.platformCrossoverCreatives24h);
      }
      return [newAdVariations24h, creativeBurstsDetected24h, repeatedHooks24h, lineageRichStores24h, platformCrossoverCreatives24h] as const;
    })();

  const [canonicalHooks24h, crossoverHooks24h, hookOfferMatched24h, hookPersonaMatched24h, topAngleCategories24h] =
    await (async () => {
      const jobs = await prisma.scraperJob
        .findMany({
          where: { type: "hook_intelligence_signals", status: "SUCCESS", finishedAt: { gte: since24h } },
          select: { payload: true },
          take: 120,
        })
        .catch(() => [] as Array<{ payload: unknown }>);
      let canonicalHooks24h = 0;
      let crossoverHooks24h = 0;
      let hookOfferMatched24h = 0;
      let hookPersonaMatched24h = 0;
      let topAngleCategories24h: Array<{ angleType: string; hooks: number }> = [];
      for (const j of jobs) {
        const p = j.payload as Record<string, unknown> | null;
        if (!p) continue;
        if (typeof p.canonicalHooks24h === "number") canonicalHooks24h = Math.max(canonicalHooks24h, p.canonicalHooks24h);
        if (typeof p.crossoverHooks24h === "number") crossoverHooks24h = Math.max(crossoverHooks24h, p.crossoverHooks24h);
        if (typeof p.hookOfferMatched24h === "number") hookOfferMatched24h = Math.max(hookOfferMatched24h, p.hookOfferMatched24h);
        if (typeof p.hookPersonaMatched24h === "number") hookPersonaMatched24h = Math.max(hookPersonaMatched24h, p.hookPersonaMatched24h);
        if (Array.isArray(p.topAngleCategories24h)) {
          topAngleCategories24h = p.topAngleCategories24h
            .filter((x: any) => x && typeof x.angleType === "string" && typeof x.hooks === "number")
            .slice(0, 10);
        }
      }
      return [canonicalHooks24h, crossoverHooks24h, hookOfferMatched24h, hookPersonaMatched24h, topAngleCategories24h] as const;
    })();

  const [boardsActive, shopsCount, adsCount] = await Promise.all([
    prisma.productCluster
      .count({
        where: {
          OR: [
            { readyToScaleScore: { gt: 0 } },
            { earlyMoverScore: { gt: 0 } },
            { marketLeaderScore: { gt: 0 } },
          ],
        },
      })
      .catch(() => 0),
    prisma.shop.count().catch(() => 0),
    prisma.ad.count().catch(() => 0),
  ]);

  const [lastWorkerTickAt, lastSuccessfulRefreshAt, freshSources1h, staleSources24h, boardsRefreshed24h] = await Promise.all([
    prisma.scraperJob
      .findFirst({ where: { type: "worker_tick", status: "SUCCESS" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } })
      .then((r) => r?.finishedAt ?? null)
      .catch(() => null),
    prisma.scraperJob
      .findFirst({ where: { type: "refresh_sources", status: "SUCCESS" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } })
      .then((r) => r?.finishedAt ?? null)
      .catch(() => null),
    prisma.source.count({ where: { lastSuccessAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }).catch(() => 0),
    prisma.source
      .count({
        where: {
          status: { in: ["ACTIVE", "PENDING"] },
          OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: since24h } }],
        },
      })
      .catch(() => 0),
    prisma.scraperJob.count({ where: { type: "evaluate_saved_board_filters", status: "SUCCESS", finishedAt: { gte: since24h } } }).catch(() => 0),
  ]);

  const zeroInputCoverageHealth = clamp(
    Math.round(
      (Math.min(1, boardsActive / 3) * 40 +
        Math.min(1, shopsCount / 20) * 30 +
        Math.min(1, adsCount / 20) * 30) *
        100
    ),
    0,
    100
  );

  // Sources + counts (avoid N+1)
  const sources = await prisma.source.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      lastSyncAt: true,
      lastSuccessAt: true,
      errorCount: true,
      lastError: true,
      createdAt: true,
      reliabilityStatus: true,
      consecutiveFailures: true,
      consecutiveEmptyRuns: true,
      cooldownUntil: true,
      disabledReason: true,
      lastHealthyAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 2500,
  });

  const sourceIds = sources.map((s) => s.id);

  const [rawCounts, candidatesBySource, jobs24h, lastJobs, recentJobsForEmpty, candidatesSummary] = await Promise.all([
    prisma.rawRecord
      .groupBy({ by: ["sourceId"], _count: { _all: true }, where: { sourceId: { in: sourceIds } } })
      .catch(() => [] as Array<{ sourceId: string; _count: { _all: number } }>),
    discoveryCandidateModel?.groupBy
      ? discoveryCandidateModel
          .groupBy({
            by: ["discoveredFromSourceId"],
            _count: { _all: true },
          })
          .catch(() => [] as Array<{ discoveredFromSourceId: string; _count: { _all: number } }>)
      : Promise.resolve([] as Array<{ discoveredFromSourceId: string; _count: { _all: number } }>),
    prisma.ingestionJob
      .groupBy({
        by: ["sourceId", "status"],
        _count: { _all: true },
        where: { createdAt: { gte: since24h }, sourceId: { in: sourceIds } },
      })
      .catch(() => [] as Array<{ sourceId: string; status: string; _count: { _all: number } }>),
    prisma.ingestionJob
      .findMany({
        where: { sourceId: { in: sourceIds } },
        orderBy: { createdAt: "desc" },
        take: 1200,
        select: { id: true, sourceId: true, status: true, createdAt: true },
      })
      .catch(() => []),
    prisma.ingestionJob
      .findMany({
        where: { sourceId: { in: sourceIds } },
        orderBy: { createdAt: "desc" },
        take: 2500,
        select: { sourceId: true, totalFetched: true, totalNormalized: true, status: true, createdAt: true },
      })
      .catch(() => []),
    Promise.all([
      discoveryCandidateModel?.count ? discoveryCandidateModel.count().catch(() => 0) : Promise.resolve(0),
      discoveryCandidateModel?.count
        ? discoveryCandidateModel
            .count({ where: { isPromoted: true, promotedAt: { gte: weekAgo } } })
            .catch(() => 0)
        : Promise.resolve(0),
    ]),
  ]);

  const [totalDiscoveryCandidates, promotedThisWeek] = candidatesSummary;

  const rawMap = new Map<string, number>(rawCounts.map((r) => [r.sourceId, r._count?._all ?? 0]));
  const candMap = new Map<string, number>(
    candidatesBySource.map((r) => [String(r.discoveredFromSourceId), r._count?._all ?? 0])
  );

  const jobsBySource = new Map<string, { ok: number; failed: number }>();
  for (const r of jobs24h) {
    const sid = String(r.sourceId);
    const s = String(r.status);
    const cur = jobsBySource.get(sid) ?? { ok: 0, failed: 0 };
    if (s === "COMPLETED" || s === "PARTIAL") cur.ok += r._count?._all ?? 0;
    if (s === "FAILED") cur.failed += r._count?._all ?? 0;
    jobsBySource.set(sid, cur);
  }

  const lastJobBySource = new Map<string, { status: string; at: Date }>();
  for (const j of lastJobs) {
    if (!lastJobBySource.has(j.sourceId)) {
      lastJobBySource.set(j.sourceId, { status: j.status, at: j.createdAt });
    }
  }

  // empty job streak per source from recent jobs snapshot
  const emptyStreakMap = new Map<string, number>();
  const bySourceRecent: Record<string, Array<{ fetched: number; normalized: number; status: string }>> = {};
  for (const j of recentJobsForEmpty) {
    (bySourceRecent[j.sourceId] ??= []).push({
      fetched: j.totalFetched ?? 0,
      normalized: j.totalNormalized ?? 0,
      status: j.status,
    });
  }
  for (const [sid, rows] of Object.entries(bySourceRecent)) {
    let streak = 0;
    for (const r of rows.slice(0, 6)) {
      const empty = (r.fetched === 0 || r.normalized === 0) && (r.status === "COMPLETED" || r.status === "PARTIAL");
      if (empty) streak += 1;
      else break;
    }
    emptyStreakMap.set(sid, streak);
  }

  const scored: OpsSourceHealthRow[] = sources.map((s) => {
    const rawCount = rawMap.get(s.id) ?? 0;
    const candidatesDiscovered = candMap.get(s.id) ?? 0;
    const j24 = jobsBySource.get(s.id) ?? { ok: 0, failed: 0 };
    const last = lastJobBySource.get(s.id) ?? null;
    const emptyJobStreak = emptyStreakMap.get(s.id) ?? 0;

    const { score, reasons } = computeHealthScore({
      lastSuccessAt: s.lastSuccessAt,
      lastSyncAt: s.lastSyncAt,
      errorCount: s.errorCount,
      rawCount,
      candidatesDiscovered,
      emptyJobStreak,
      stalledHours,
    });

    const relReasons = [...reasons];
    if (s.reliabilityStatus && s.reliabilityStatus !== "HEALTHY") {
      relReasons.push(`reliability:${String(s.reliabilityStatus)}`);
    }
    if (s.consecutiveFailures >= 3) relReasons.push(`cf:${s.consecutiveFailures}`);
    if (s.consecutiveEmptyRuns >= 5) relReasons.push(`empty_runs:${s.consecutiveEmptyRuns}`);

    return {
      id: s.id,
      name: s.name,
      type: String(s.type),
      status: String(s.status),
      lastSyncAt: s.lastSyncAt,
      lastSuccessAt: s.lastSuccessAt,
      errorCount: s.errorCount,
      lastError: s.lastError,
      rawCount,
      candidatesDiscovered,
      jobs24hSucceeded: j24.ok,
      jobs24hFailed: j24.failed,
      lastJobStatus: last?.status ?? null,
      lastJobAt: last?.at ?? null,
      emptyJobStreak,
      healthScore: score,
      band: bandForScore(score),
      reasons: relReasons,
      reliabilityStatus: String(s.reliabilityStatus ?? "HEALTHY"),
      consecutiveFailures: s.consecutiveFailures,
      consecutiveEmptyRuns: s.consecutiveEmptyRuns,
      cooldownUntil: s.cooldownUntil,
      disabledReason: s.disabledReason,
      lastHealthyAt: s.lastHealthyAt,
    };
  });

  const totalActiveSources = sources.filter((s) => s.status === "ACTIVE").length;
  const successfulJobs24h = [...jobsBySource.values()].reduce((a, b) => a + b.ok, 0);
  const failedJobs24h = [...jobsBySource.values()].reduce((a, b) => a + b.failed, 0);
  const avgSourceHealthScore =
    scored.length > 0 ? Math.round((scored.reduce((a, b) => a + b.healthScore, 0) / scored.length) * 10) / 10 : 0;
  const stalledSources = scored.filter((s) => (s.lastSyncAt ? s.lastSyncAt < hoursAgo(stalledHours) : true));

  const failedJobs = await prisma.ingestionJob.findMany({
    where: { status: "FAILED", createdAt: { gte: since24h } },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { source: { select: { id: true, name: true, type: true } } },
  });

  const topCandidates = await discoveryCandidateModel
    .findMany({
      where: { isPromoted: false, discoveryScore: { gte: 70 } },
      orderBy: [{ discoveryScore: "desc" }, { rawEvidenceCount: "desc" }, { createdAt: "desc" }],
      take: 25,
    })
    .catch(() => []);

  const promotedSources = await prisma.source.findMany({
    where: {
      type: "SHOPIFY_DOMAIN",
      createdAt: { gte: weekAgo },
      name: { startsWith: "Discovered:" },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, name: true, domain: true, type: true, createdAt: true },
  });

  const worstSources = [...scored].sort((a, b) => a.healthScore - b.healthScore).slice(0, 12);
  const bestSources = [...scored].sort((a, b) => b.healthScore - a.healthScore).slice(0, 12);

  return {
    summary: {
      totalActiveSources,
      totalDiscoveryCandidates,
      promotedThisWeek,
      successfulJobs24h,
      failedJobs24h,
      avgSourceHealthScore,
      stalledSourcesCount: stalledSources.length,
      autonomousDiscoveries24h,
      discoverSourcesTicks24h: discoverTicks24h,
      autoPromotedSources24h,
      backlogCandidatesHigh,
      zeroInputCoverageHealth,
      zeroInputFillRatioPercent: zeroInputCoverageHealth,
      storesDiscovered24h,
      productsExtracted24h,
      collectionsExtracted24h,
      storefrontsEnriched24h,
      creativesDiscovered24h,
      productClustersCreated24h,
      freshSources6h,
      feedbackSeeds24h,
      boostedFreshSources24h,
      winnerDomainsRecycled24h,
      compareRivalsRecycled24h,
      watchlistSpikesRecycled24h,
      newDomainsNormalized24h,
      falsePositivesSuppressed24h,
      boardCoverageRatioPercent,
      duplicateRawSuppressions24h,
      qualityReviewItemsOpened24h,
      lowConfidenceClustersOpen,
      entityLinkReviewOpen,
      canonicalStoreCollisionsOpen,
      reliabilityHealthy,
      reliabilityDegraded,
      reliabilityCoolingDown,
      reliabilityDisabled,
      staleRunningJobsRecovered24h,
      sourcesInEmptyStreak5Plus,
      avgConsecutiveFailures: Math.round((reliabilityFailureAvg._avg.consecutiveFailures ?? 0) * 10) / 10,
      avgConsecutiveEmptyRuns: Math.round((reliabilityEmptyAvg._avg.consecutiveEmptyRuns ?? 0) * 10) / 10,
      sourceReliabilityAlertsOpen,
      newAdVariations24h,
      creativeBurstsDetected24h,
      repeatedHooks24h,
      lineageRichStores24h,
      platformCrossoverCreatives24h,
      canonicalHooks24h,
      crossoverHooks24h,
      hookOfferMatched24h,
      hookPersonaMatched24h,
      topAngleCategories24h,
      lastWorkerTickAt,
      lastSuccessfulRefreshAt,
      freshSources1h,
      staleSources24h,
      boardsRefreshed24h,
    },
    worstSources,
    bestSources,
    failedJobs: failedJobs.map((j) => ({
      id: j.id,
      sourceId: j.sourceId,
      sourceName: j.source?.name ?? j.sourceId,
      sourceType: String(j.source?.type ?? "UNKNOWN"),
      status: j.status,
      error: j.error ?? null,
      createdAt: j.createdAt,
    })),
    topCandidates: topCandidates.map((c) => ({
      id: c.id,
      domain: c.domain,
      discoveryScore: c.discoveryScore,
      rawEvidenceCount: c.rawEvidenceCount,
      discoveryReason: c.discoveryReason,
      discoveredFromSourceId: c.discoveredFromSourceId,
      createdAt: c.createdAt,
    })),
    promotedSources,
    stalledSources: stalledSources.sort((a, b) => (a.lastSyncAt?.getTime() ?? 0) - (b.lastSyncAt?.getTime() ?? 0)).slice(0, 20),
  };
}

