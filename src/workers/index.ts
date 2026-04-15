import prisma from "@/src/lib/prisma";
import { refreshAdsJob } from "@/src/workers/refreshAds";
import { discoverSourcesJob } from "@/src/workers/discoverSources";
import { autonomousDiscoveryJob } from "@/src/workers/autonomousDiscovery";
import { refreshSourcesJob } from "@/src/workers/refreshSources";
import { feedbackSeedsJob } from "@/src/workers/feedbackSeeds";
import { refreshShopsJob } from "@/src/workers/refreshShops";
import { recalculateScoresJob } from "@/src/workers/scoring";
import { refreshProductClustersJob } from "@/src/workers/productClusters";
import { refreshCreativeClustersJob } from "@/src/workers/creativeClusters";
import { refreshIntelligenceSignalsJob } from "@/src/workers/intelligenceSignals";
import { creativeDepthSignalsJob } from "@/src/workers/creativeDepthSignals";
import { hookIntelligenceSignalsJob } from "@/src/workers/hookIntelligence";
import { evaluateSavedBoardFiltersJob } from "@/src/workers/evaluateSavedBoardFilters";
import { evaluateWatchlistsJob } from "@/src/workers/evaluateWatchlists";
import { createHistoricalSnapshotsJob } from "@/src/workers/createHistoricalSnapshots";
import { customerSuccessJob } from "@/src/workers/customerSuccess";
import { tenantBackfillJob } from "@/src/workers/tenantBackfill";
import { integrationSyncRunsJob } from "@/src/workers/integrationSyncRuns";
import { sweepAllStuckJobs } from "@/server/services/stuck-job-sweep.service";
import { assertProdEnvOrThrow, getEnvChecks } from "@/lib/env";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJob(type: string, fn: () => Promise<Record<string, unknown>>) {
  const startedAt = new Date();
  const job = await prisma.scraperJob.create({
    data: { type, status: "RUNNING", startedAt },
  });

  try {
    const payload = await fn();
    await prisma.scraperJob.update({
      where: { id: job.id },
      data: { status: "SUCCESS", finishedAt: new Date(), payload: payload as never },
    });
    return { ok: true as const, payload };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.scraperJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: msg },
    });
    return { ok: false as const, error: msg };
  }
}

async function main() {
  // Pre-flight checks (fail-fast in production).
  try {
    assertProdEnvOrThrow();
  } catch (e) {
    console.error("[worker] env validation failed", e instanceof Error ? e.message : String(e));
    throw e;
  }

  const envSummary = getEnvChecks()
    .filter((c) => c.level !== "green")
    .map((c) => ({ key: c.key, level: c.level, message: c.message }))
    .slice(0, 20);
  if (envSummary.length) console.info("[worker] env checks (non-green)", envSummary);

  const intervalMs = Number.parseInt(process.env.WORKER_INTERVAL_MS ?? "60000", 10) || 60_000;
  const enableAdsFallback = process.env.WORKER_ENABLE_ADS_FALLBACK === "true";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const tickStartedAt = new Date();
    console.info(`[worker] tick ${tickStartedAt.toISOString()}`);

    await sweepAllStuckJobs().catch((e) => console.warn("[worker] stuck job sweep failed (non-fatal)", String(e)));

    const ds = await runJob(
      "discover_sources",
      async () => discoverSourcesJob() as unknown as Record<string, unknown>
    );
    if (ds.ok) console.info("[worker] discover_sources ok", ds.payload);
    else console.warn("[worker] discover_sources failed (non-fatal)", ds.error);

    const ad = await runJob(
      "autonomous_discovery",
      async () => autonomousDiscoveryJob() as unknown as Record<string, unknown>
    );
    if (ad.ok) console.info("[worker] autonomous_discovery ok", ad.payload);
    else console.warn("[worker] autonomous_discovery failed (non-fatal)", ad.error);

    const fb = await runJob("feedback_seeds", async () => feedbackSeedsJob() as unknown as Record<string, unknown>);
    if (fb.ok) console.info("[worker] feedback_seeds ok", fb.payload);
    else console.warn("[worker] feedback_seeds failed (non-fatal)", fb.error);

    const rs = await runJob(
      "refresh_sources",
      async () => refreshSourcesJob() as unknown as Record<string, unknown>
    );
    if (rs.ok) console.info("[worker] refresh_sources ok", rs.payload);
    else console.warn("[worker] refresh_sources failed", rs.error);

    const a = enableAdsFallback
      ? await runJob("fallback_refresh_ads", async () => refreshAdsJob() as unknown as Record<string, unknown>)
      : { ok: true as const, payload: { skipped: true } as Record<string, unknown> };
    if (enableAdsFallback) {
      if (a.ok) console.info("[worker] fallback_refresh_ads ok", a.payload);
      else console.warn("[worker] fallback_refresh_ads optional failed", a.error);
    }

    const s = await runJob("refresh_shops", async () => refreshShopsJob() as unknown as Record<string, unknown>);
    if (s.ok) console.info("[worker] refresh_shops ok", s.payload);
    else console.warn("[worker] refresh_shops failed", s.error);

    const r = await runJob("recalculate_scores", async () => recalculateScoresJob() as unknown as Record<string, unknown>);
    if (r.ok) console.info("[worker] recalculate_scores ok", r.payload);
    else console.warn("[worker] recalculate_scores failed", r.error);

    const pc = await runJob(
      "refresh_product_clusters",
      async () => refreshProductClustersJob() as unknown as Record<string, unknown>
    );
    if (pc.ok) console.info("[worker] refresh_product_clusters ok", pc.payload);
    else console.warn("[worker] refresh_product_clusters failed", pc.error);

    const cc = await runJob(
      "refresh_creative_clusters",
      async () => refreshCreativeClustersJob() as unknown as Record<string, unknown>
    );
    if (cc.ok) console.info("[worker] refresh_creative_clusters ok", cc.payload);
    else console.warn("[worker] refresh_creative_clusters failed", cc.error);

    const cds = await runJob(
      "creative_depth_signals",
      async () => creativeDepthSignalsJob() as unknown as Record<string, unknown>
    );
    if (cds.ok) console.info("[worker] creative_depth_signals ok", cds.payload);
    else console.warn("[worker] creative_depth_signals failed (non-fatal)", cds.error);

    const his = await runJob(
      "hook_intelligence_signals",
      async () => hookIntelligenceSignalsJob() as unknown as Record<string, unknown>
    );
    if (his.ok) console.info("[worker] hook_intelligence_signals ok", his.payload);
    else console.warn("[worker] hook_intelligence_signals failed (non-fatal)", his.error);

    const intel = await runJob(
      "refresh_intelligence_signals",
      async () => refreshIntelligenceSignalsJob() as unknown as Record<string, unknown>
    );
    if (intel.ok) console.info("[worker] refresh_intelligence_signals ok", intel.payload);
    else console.warn("[worker] refresh_intelligence_signals failed", intel.error);

    const hs = await runJob(
      "create_historical_snapshots",
      async () => createHistoricalSnapshotsJob() as unknown as Record<string, unknown>
    );
    if (hs.ok) console.info("[worker] create_historical_snapshots ok", hs.payload);
    else console.warn("[worker] create_historical_snapshots failed (non-fatal)", hs.error);

    const sf = await runJob(
      "evaluate_saved_board_filters",
      async () => evaluateSavedBoardFiltersJob() as unknown as Record<string, unknown>
    );
    if (sf.ok) console.info("[worker] evaluate_saved_board_filters ok", sf.payload);
    else console.warn("[worker] evaluate_saved_board_filters failed (non-fatal)", sf.error);

    const wl = await runJob(
      "evaluate_watchlists",
      async () => evaluateWatchlistsJob() as unknown as Record<string, unknown>
    );
    if (wl.ok) console.info("[worker] evaluate_watchlists ok", wl.payload);
    else console.warn("[worker] evaluate_watchlists failed (non-fatal)", wl.error);

    const cs = await runJob("customer_success", async () => customerSuccessJob() as unknown as Record<string, unknown>);
    if (cs.ok) console.info("[worker] customer_success ok", cs.payload);
    else console.warn("[worker] customer_success failed (non-fatal)", cs.error);

    const tb = await runJob("tenant_backfill", async () => tenantBackfillJob() as unknown as Record<string, unknown>);
    if (tb.ok) console.info("[worker] tenant_backfill ok", tb.payload);
    else console.warn("[worker] tenant_backfill failed (non-fatal)", tb.error);

    const isr = await runJob(
      "integration_sync_runs",
      async () => integrationSyncRunsJob() as unknown as Record<string, unknown>
    );
    if (isr.ok) console.info("[worker] integration_sync_runs ok", isr.payload);
    else console.warn("[worker] integration_sync_runs failed (non-fatal)", isr.error);

    const tickFinishedAt = new Date();
    const [newStores, newProducts, newCreatives, newClusters] = await Promise.all([
      prisma.store.count({ where: { createdAt: { gte: tickStartedAt } } }).catch(() => 0),
      prisma.product.count({ where: { createdAt: { gte: tickStartedAt } } }).catch(() => 0),
      prisma.creativeCluster.count({ where: { createdAt: { gte: tickStartedAt } } }).catch(() => 0),
      prisma.productCluster.count({ where: { createdAt: { gte: tickStartedAt } } }).catch(() => 0),
    ]);

    const refreshedSources = rs.ok && typeof (rs.payload as any)?.sourcesSucceeded === "number" ? Number((rs.payload as any).sourcesSucceeded) : 0;
    const failedSources = rs.ok && typeof (rs.payload as any)?.sourcesFailed === "number" ? Number((rs.payload as any).sourcesFailed) : 0;
    const updatedBoards =
      sf.ok && typeof (sf.payload as any)?.filtersEvaluated === "number" ? Number((sf.payload as any).filtersEvaluated) : 0;

    // Heartbeat: persist tick summary for freshness surfaces.
    await prisma.scraperJob
      .create({
        data: {
          type: "worker_tick",
          status: "SUCCESS",
          startedAt: tickStartedAt,
          finishedAt: tickFinishedAt,
          payload: {
            newStores,
            newProducts,
            newCreatives,
            newClusters,
            updatedBoards,
            refreshedSources,
            failedSources,
          } as never,
        },
      })
      .catch(() => null);

    console.info("[worker] tick done", {
      discover_sources: ds.ok ? "ok" : "failed_nonfatal",
      autonomous_discovery: ad.ok ? "ok" : "failed_nonfatal",
      refresh_sources: rs.ok ? "ok" : "failed",
      refresh_ads: enableAdsFallback ? (a.ok ? "ok" : "optional_failed") : "skipped",
      refresh_shops: s.ok ? "ok" : "failed",
      recalculate_scores: r.ok ? "ok" : "failed",
      refresh_product_clusters: pc.ok ? "ok" : "failed",
      refresh_creative_clusters: cc.ok ? "ok" : "failed",
      refresh_intelligence_signals: intel.ok ? "ok" : "failed",
      create_historical_snapshots: hs.ok ? "ok" : "failed_nonfatal",
      evaluate_saved_board_filters: sf.ok ? "ok" : "failed_nonfatal",
      evaluate_watchlists: wl.ok ? "ok" : "failed_nonfatal",
      customer_success: cs.ok ? "ok" : "failed_nonfatal",
      tenant_backfill: tb.ok ? "ok" : "failed_nonfatal",
      newStores,
      newProducts,
      newCreatives,
      newClusters,
      updatedBoards,
      refreshedSources,
      failedSources,
    });

    console.info(`[worker] sleeping ${intervalMs}ms`);
    await sleep(intervalMs);
  }
}

main()
  .catch((e) => {
    console.error("[worker] fatal", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

