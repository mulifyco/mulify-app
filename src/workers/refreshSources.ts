import prisma from "@/src/lib/prisma";
import { runIngestionJob } from "@/jobs/runner";
import type { SourceReliabilityStatus } from "@prisma/client";
import { schedulerSkipReason, compareSchedulerSources } from "@/server/services/source-reliability.service";
import { sweepStuckIngestionJobs } from "@/server/services/stuck-job-sweep.service";
import { canonicalDiscoveryStoreDomain } from "@/lib/intelligence/discovery-coverage";
import { loadDiscoveryScoringContext } from "@/server/services/discovery-scoring-context.service";
import { sourceDb } from "@/lib/prisma-source-delegate";

type SourceRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  priority: number;
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  updatedAt: Date;
  reliabilityStatus: SourceReliabilityStatus;
  cooldownUntil: Date | null;
  disabledReason: string | null;
  consecutiveFailures: number;
  consecutiveEmptyRuns: number;
  domain: string | null;
};

function msFromEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  if (!raw) return fallbackMs;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallbackMs;
}

async function logSource(
  sourceId: string,
  jobId: string | null,
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>
) {
  await prisma.syncLog
    .create({
      data: {
        sourceId,
        jobId,
        level,
        message,
        data: (data as never) ?? null,
      },
    })
    .catch(() => null);
}

function isDue(s: SourceRow, cadenceMs: number): boolean {
  if (!s.lastSyncAt) return true;
  return Date.now() - s.lastSyncAt.getTime() >= cadenceMs;
}

const DISABLED_TYPES = new Set(["KEYWORD", "META_PAGE", "CATEGORY"]);

/**
 * Ingestion-first source scheduler: prefers storefront ingestion and keeps Meta ads as optional/fallback.
 *
 * - SHOPIFY_DOMAIN / SHOPIFY_STOREFRONT: runs persisted ingestion (raw → normalized → entity links).
 * - KEYWORD / META_PAGE: intentionally disabled for now (logs + keeps system valuable).
 * - TIKTOK_PAGE: same persisted pipeline as manual runs; optional worker cadence via SOURCE_REFRESH_TIKTOK_MS.
 */
export async function refreshSourcesJob(): Promise<{
  sourcesDue: number;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  sourcesSkippedDisabled: number;
  sourcesSkippedReliability: number;
  stuckIngestionJobsRecovered: number;
  boostedFreshSources: number;
  freshSources1h: number;
  staleSources24h: number;
}> {
  const stuckIngestionJobsRecovered = await sweepStuckIngestionJobs().catch(() => 0);

  // Tiered freshness cadence (defaults match product goals).
  const cadenceHotMs = msFromEnv("SOURCE_REFRESH_HOT_MS", 60 * 60 * 1000);
  const cadenceWarmMs = msFromEnv("SOURCE_REFRESH_WARM_MS", 6 * 60 * 60 * 1000);
  const cadenceStaleMs = msFromEnv("SOURCE_REFRESH_STALE_MS", 24 * 60 * 60 * 1000);
  const maxPerTick = Number.parseInt(process.env.SOURCE_REFRESH_MAX_PER_TICK ?? "5", 10) || 5;
  const since1h = new Date(Date.now() - 60 * 60 * 1000);
  const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [scoreCtx, watchlistDomains, compareDomains] = await Promise.all([
    loadDiscoveryScoringContext().catch(() => null),
    prisma.watchlistStore.findMany({ take: 900, select: { domain: true } }).catch(() => [] as Array<{ domain: string }>),
    prisma.discoveryCandidate
      .findMany({ where: { createdAt: { gte: since24h }, sourceTypeHint: { in: ["COMPARE_RIVAL", "COMPARE"] } }, take: 400, select: { domain: true } })
      .catch(() => [] as Array<{ domain: string }>),
  ]);
  const wlSet = new Set<string>();
  for (const w of watchlistDomains) {
    const d = canonicalDiscoveryStoreDomain(w.domain);
    if (d) wlSet.add(d);
  }
  const cmpSet = new Set<string>();
  for (const c of compareDomains) {
    const d = canonicalDiscoveryStoreDomain(c.domain);
    if (d) cmpSet.add(d);
  }

  const sources = (await sourceDb().findMany({
    where: { status: { in: ["ACTIVE", "PENDING"] } },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      priority: true,
      lastSyncAt: true,
      lastSuccessAt: true,
      updatedAt: true,
      reliabilityStatus: true,
      cooldownUntil: true,
      disabledReason: true,
      consecutiveFailures: true,
      consecutiveEmptyRuns: true,
      domain: true,
    },
  })) as unknown as SourceRow[];

  let sourcesDue = 0;
  const due: SourceRow[] = [];
  const boosts = new Map<string, number>();

  for (const s of sources) {
    if (DISABLED_TYPES.has(s.type)) {
      continue;
    }

    const skipRel = schedulerSkipReason(s);
    if (skipRel) {
      continue;
    }

    const d = s.domain ? canonicalDiscoveryStoreDomain(s.domain) : null;
    const hotSignal =
      (s.lastSuccessAt && s.lastSuccessAt.getTime() >= since1h.getTime()) ||
      (d
        ? Boolean(
            wlSet.has(d) ||
              cmpSet.has(d) ||
              scoreCtx?.boardDomains?.has(d) ||
              scoreCtx?.creativeWinnerDomains?.has(d) ||
              scoreCtx?.watchlistSpikeDomains?.has(d)
          )
        : false);
    const warmSignal =
      hotSignal || (s.lastSuccessAt && s.lastSuccessAt.getTime() >= since6h.getTime()) || (d ? Boolean(scoreCtx?.newProducts24hDomains?.has(d)) : false);

    // Penalize failing/empty sources by stretching cadence.
    const penalty =
      (s.consecutiveFailures >= 3 ? 1 : 0) + (s.consecutiveEmptyRuns >= 4 ? 1 : 0);
    let cadence = hotSignal ? cadenceHotMs : warmSignal ? cadenceWarmMs : cadenceStaleMs;
    if (penalty >= 2) cadence = Math.min(cadence * 2, cadenceStaleMs * 3);

    if (s.type === "SHOPIFY_DOMAIN" || s.type === "SHOPIFY_STOREFRONT" || s.type === "TIKTOK_PAGE") {
      if (isDue(s, cadence)) {
        sourcesDue++;
        due.push(s);
      }
    }
  }

  // Freshness boost (stable + minimal): nudge hot/recent sources up without breaking reliability ordering.
  for (const s of due) {
    let b = 0;
    if (s.lastSuccessAt && s.lastSuccessAt.getTime() >= since6h.getTime()) b += 6;
    if (s.consecutiveEmptyRuns >= 3) b -= 3;
    const d = s.domain ? canonicalDiscoveryStoreDomain(s.domain) : null;
    if (d) {
      if (wlSet.has(d)) b += 3;
      if (cmpSet.has(d)) b += 2;
      if (scoreCtx?.boardDomains?.has(d)) b += 3;
      if (scoreCtx?.creativeWinnerDomains?.has(d)) b += 2;
      if (scoreCtx?.newProducts24hDomains?.has(d)) b += 2;
      if (scoreCtx?.offerDenseDomains?.has(d)) b += 2;
      if (scoreCtx?.watchlistSpikeDomains?.has(d)) b += 3;
    }
    boosts.set(s.id, b);
  }
  due.sort((a, b) => {
    const ba = boosts.get(a.id) ?? 0;
    const bb = boosts.get(b.id) ?? 0;
    if (ba !== bb) return bb - ba;
    return compareSchedulerSources(a, b);
  });

  const slice = due.slice(0, Math.max(1, maxPerTick));

  let sourcesAttempted = 0;
  let sourcesSucceeded = 0;
  let sourcesFailed = 0;
  let sourcesSkippedDisabled = 0;
  let sourcesSkippedReliability = 0;
  let boostedFreshSources = 0;

  for (const s of slice) {
    sourcesAttempted++;
    if ((boosts.get(s.id) ?? 0) >= 4) boostedFreshSources += 1;
    await logSource(s.id, null, "info", "Worker scheduling ingestion", {
      worker: "refresh_sources",
      sourceType: s.type,
      reliabilityStatus: s.reliabilityStatus,
      boost: boosts.get(s.id) ?? 0,
    });

    try {
      const res = await runIngestionJob(s.id, "worker");
      if (!res.ok) {
        sourcesFailed++;
        await logSource(s.id, null, "warn", "Worker ingestion skipped", {
          code: res.code,
          message: res.message,
          reliabilityStatus: s.reliabilityStatus,
        });
        if (res.code === "SOURCE_DISABLED" || res.code === "SOURCE_COOLDOWN") {
          sourcesSkippedReliability += 1;
        }
        continue;
      }

      sourcesSucceeded++;
      await logSource(s.id, res.jobId, "info", "Worker ingestion completed", {
        status: res.status,
        totalFetched: res.totalFetched,
        totalNormalized: res.totalNormalized,
        totalFailed: res.totalFailed,
        durationMs: res.durationMs,
      });
    } catch (e) {
      sourcesFailed++;
      const msg = e instanceof Error ? e.message : String(e);
      await logSource(s.id, null, "error", "Worker ingestion failed", { error: msg });
    }
  }

  const disabled = sources.filter((s) => DISABLED_TYPES.has(s.type)).slice(0, 25);
  for (const s of disabled) {
    sourcesSkippedDisabled++;
    await logSource(s.id, null, "warn", "Source type disabled (ingestion-first mode)", {
      sourceType: s.type,
      note: "Use SHOPIFY_DOMAIN / SHOPIFY_STOREFRONT / TIKTOK_PAGE sources for ingestion",
    });
  }

  return {
    sourcesDue,
    sourcesAttempted,
    sourcesSucceeded,
    sourcesFailed,
    sourcesSkippedDisabled,
    sourcesSkippedReliability,
    stuckIngestionJobsRecovered,
    boostedFreshSources,
    freshSources1h: await sourceDb().count({ where: { lastSuccessAt: { gte: since1h } } }).catch(() => 0),
    staleSources24h: await sourceDb()
      .count({
        where: {
          status: { in: ["ACTIVE", "PENDING"] },
          OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: since24h } }],
        },
      })
      .catch(() => 0),
  };
}
