import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import QueryErrorState from "@/components/internal/QueryErrorState";
import Badge from "@/components/ui/Badge";
import { formatDate, timeAgo } from "@/lib/date";

function cooldownLabel(until: Date | null): string {
  if (!until || until.getTime() <= Date.now()) return "—";
  return formatDate(until);
}
import { getCachedOpsSourceHealth } from "@/lib/perf/cached-server-data";
import { getRouteTimingSummary } from "@/lib/perf/route-timing";
import SectionHeader from "@/components/internal/SectionHeader";
import PaywallPanel from "@/components/internal/PaywallPanel";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

function bandVariant(b: string): "green" | "yellow" | "red" | "default" {
  if (b === "HEALTHY") return "green";
  if (b === "WARNING") return "yellow";
  if (b === "CRITICAL") return "red";
  return "default";
}

export default async function OpsPage() {
  const session = await auth();
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "OPS")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ops" description="Source discovery/ingestion operational health — one screen." />
        <PaywallPanel
          feature="OPS"
          currentPlan={plan}
          title="Ops dashboard is a Pro feature"
          description="Upgrade to monitor source health, failed jobs, stalls, and high-confidence discovery at a glance."
        />
      </div>
    );
  }

  let data: Awaited<ReturnType<typeof getCachedOpsSourceHealth>> | null = null;
  const perf = getRouteTimingSummary();
  let opsPayloadMs = 0;
  let error: string | null = null;
  try {
    const t0 = Date.now();
    data = await getCachedOpsSourceHealth();
    opsPayloadMs = Date.now() - t0;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load ops dashboard.";
  }

  return (
    <div>
      <PageHeader title="Ops" description="Source discovery/ingestion operational health — one screen." />

      {error || !data ? (
        <QueryErrorState message={error ?? "Unknown error"} />
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-sm text-sm">
            <SectionHeader
              title="Read performance (best-effort)"
              description="In-process API timings (single-node). This ops payload time includes cache hits."
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              <div className="rounded border border-border px-3 py-2">
                <div className="text-[10px] text-muted uppercase">Ops payload</div>
                <div className="text-lg font-semibold tabular-nums">{opsPayloadMs}ms</div>
              </div>
              <div className="rounded border border-border px-3 py-2">
                <div className="text-[10px] text-muted uppercase">API samples (24h)</div>
                <div className="text-lg font-semibold tabular-nums">{perf.samples24h}</div>
              </div>
              <div className="rounded border border-border px-3 py-2">
                <div className="text-[10px] text-muted uppercase">Avg API (24h)</div>
                <div className="text-lg font-semibold tabular-nums">{perf.avgMsAll24h}ms</div>
              </div>
              <div className="rounded border border-border px-3 py-2">
                <div className="text-[10px] text-muted uppercase">Heavy board fetches</div>
                <div className="text-lg font-semibold tabular-nums">{perf.heavyBoardFetches24h}</div>
              </div>
            </div>
            {perf.slowEndpoints24h.length ? (
              <div className="mt-3 text-xs text-muted">
                <span className="font-semibold text-foreground">Slow endpoints (avg ≥200ms):</span>{" "}
                {perf.slowEndpoints24h.map((s) => `${s.path} ~${s.avgMs}ms`).join(" · ")}
              </div>
            ) : (
              <div className="mt-3 text-xs text-muted">No slow API samples recorded in this process yet.</div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3 mb-4 text-sm">
            {[
              ["Active sources", data.summary.totalActiveSources, "default"],
              ["Discovery candidates", data.summary.totalDiscoveryCandidates, "default"],
              ["Promoted (7d)", data.summary.promotedThisWeek, "default"],
              ["Auto discovers (24h)", data.summary.autonomousDiscoveries24h, "default"],
              ["Discover ticks (24h)", data.summary.discoverSourcesTicks24h, "default"],
              ["Auto promoted (24h)", data.summary.autoPromotedSources24h, "green"],
              ["Backlog (≥70)", data.summary.backlogCandidatesHigh, data.summary.backlogCandidatesHigh > 0 ? "yellow" : "default"],
              [
                "Zero-input fill",
                data.summary.zeroInputFillRatioPercent,
                data.summary.zeroInputFillRatioPercent >= 75
                  ? "green"
                  : data.summary.zeroInputFillRatioPercent >= 45
                    ? "yellow"
                    : "red",
              ],
              ["Jobs ok (24h)", data.summary.successfulJobs24h, "green"],
              ["Jobs failed (24h)", data.summary.failedJobs24h, data.summary.failedJobs24h > 0 ? "red" : "default"],
              ["Avg health", data.summary.avgSourceHealthScore, "default"],
              ["Stalled", data.summary.stalledSourcesCount, data.summary.stalledSourcesCount > 0 ? "yellow" : "default"],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{label}</div>
                <div
                  className={`text-xl font-semibold tabular-nums mt-1 ${
                    tone === "green"
                      ? "text-emerald-600"
                      : tone === "red"
                        ? "text-red-600"
                        : tone === "yellow"
                          ? "text-amber-600"
                          : "text-foreground"
                  }`}
                >
                  {String(value)}
                </div>
              </div>
            ))}
          </div>

          <div className="mb-8">
            <SectionHeader
              title="Coverage (24h)"
              description="Live discovery quality: new stores, normalized domains, false-positive blocks, board fill."
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 text-sm">
              {[
                ["Stores discovered", data.summary.storesDiscovered24h, "default"],
                ["Products extracted", data.summary.productsExtracted24h, "default"],
                ["Collections extracted", data.summary.collectionsExtracted24h, "default"],
                ["Storefronts enriched", data.summary.storefrontsEnriched24h, "default"],
                ["Creatives discovered", data.summary.creativesDiscovered24h, "default"],
                ["Clusters created", data.summary.productClustersCreated24h, "default"],
                ["Fresh sources (<6h)", data.summary.freshSources6h, data.summary.freshSources6h >= 3 ? "green" : "yellow"],
                ["Boosted sources", data.summary.boostedFreshSources24h, data.summary.boostedFreshSources24h > 0 ? "green" : "default"],
                ["New domains normalized", data.summary.newDomainsNormalized24h, "green"],
                ["False positives suppressed", data.summary.falsePositivesSuppressed24h, "default"],
                ["Feedback seeds", data.summary.feedbackSeeds24h, data.summary.feedbackSeeds24h > 0 ? "green" : "default"],
                ["Winner domains recycled", data.summary.winnerDomainsRecycled24h, data.summary.winnerDomainsRecycled24h > 0 ? "green" : "default"],
                ["Compare rivals recycled", data.summary.compareRivalsRecycled24h, data.summary.compareRivalsRecycled24h > 0 ? "green" : "default"],
                ["Watchlist spikes recycled", data.summary.watchlistSpikesRecycled24h, data.summary.watchlistSpikesRecycled24h > 0 ? "green" : "default"],
                [
                  "Board coverage %",
                  data.summary.boardCoverageRatioPercent,
                  data.summary.boardCoverageRatioPercent >= 20 ? "green" : "yellow",
                ],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{label}</div>
                  <div
                    className={`text-xl font-semibold tabular-nums mt-1 ${
                      tone === "green"
                        ? "text-emerald-600"
                        : tone === "red"
                          ? "text-red-600"
                          : tone === "yellow"
                            ? "text-amber-600"
                            : "text-foreground"
                    }`}
                  >
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <SectionHeader
              title="Data quality"
              description="Dedupe suppression, review-queue load, and canonical store collision signals."
            />
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
              {[
                ["Duplicate raw suppressed (24h)", data.summary.duplicateRawSuppressions24h, "default"],
                ["Quality items opened (24h)", data.summary.qualityReviewItemsOpened24h, "yellow"],
                ["Low-confidence clusters open", data.summary.lowConfidenceClustersOpen, "default"],
                ["Entity link review open", data.summary.entityLinkReviewOpen, "default"],
                ["Store canonical collisions open", data.summary.canonicalStoreCollisionsOpen, "yellow"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{label}</div>
                  <div
                    className={`text-xl font-semibold tabular-nums mt-1 ${
                      tone === "green"
                        ? "text-emerald-600"
                        : tone === "red"
                          ? "text-red-600"
                          : tone === "yellow"
                            ? "text-amber-600"
                            : "text-foreground"
                    }`}
                  >
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <SectionHeader
              title="Creative depth (24h)"
              description="Meta/TikTok depth: variations, bursts, hooks, and cross-platform families."
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 text-sm">
              {[
                ["New ad variations", data.summary.newAdVariations24h, "default"],
                ["Creative bursts", data.summary.creativeBurstsDetected24h, data.summary.creativeBurstsDetected24h > 0 ? "green" : "default"],
                ["Repeated hooks", data.summary.repeatedHooks24h, data.summary.repeatedHooks24h > 0 ? "green" : "default"],
                ["Lineage-rich stores", data.summary.lineageRichStores24h, data.summary.lineageRichStores24h > 0 ? "green" : "default"],
                ["Platform crossover", data.summary.platformCrossoverCreatives24h, data.summary.platformCrossoverCreatives24h > 0 ? "green" : "default"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{label}</div>
                  <div
                    className={`text-xl font-semibold tabular-nums mt-1 ${
                      tone === "green"
                        ? "text-emerald-600"
                        : tone === "red"
                          ? "text-red-600"
                          : tone === "yellow"
                            ? "text-amber-600"
                            : "text-foreground"
                    }`}
                  >
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <SectionHeader
              title="Winning hook intelligence (24h)"
              description="Canonical hooks + angle taxonomy + bridge coverage."
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 text-sm">
              {[
                ["Canonical hooks", data.summary.canonicalHooks24h, data.summary.canonicalHooks24h > 0 ? "green" : "default"],
                ["Crossover hooks", data.summary.crossoverHooks24h, data.summary.crossoverHooks24h > 0 ? "green" : "default"],
                ["Hook↔offer matched", data.summary.hookOfferMatched24h, data.summary.hookOfferMatched24h > 0 ? "green" : "default"],
                ["Hook↔persona matched", data.summary.hookPersonaMatched24h, data.summary.hookPersonaMatched24h > 0 ? "green" : "default"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{label}</div>
                  <div
                    className={`text-xl font-semibold tabular-nums mt-1 ${
                      tone === "green"
                        ? "text-emerald-600"
                        : tone === "red"
                          ? "text-red-600"
                          : tone === "yellow"
                            ? "text-amber-600"
                            : "text-foreground"
                    }`}
                  >
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-border bg-card p-3 shadow-sm">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em] mb-2">Top angle categories</div>
              <div className="flex flex-wrap gap-2">
                {(data.summary.topAngleCategories24h ?? []).length ? (
                  (data.summary.topAngleCategories24h ?? []).slice(0, 10).map((x) => (
                    <span key={x.angleType} className="text-xs px-2 py-1 rounded bg-surface-2 text-foreground border border-border">
                      {String(x.angleType).replace(/_/g, " ")} · {x.hooks}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-2">—</span>
                )}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <SectionHeader title="Live freshness" description="Worker heartbeat + source freshness SLAs." />
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 text-sm">
              {[
                ["Last worker tick", data.summary.lastWorkerTickAt ? timeAgo(new Date(data.summary.lastWorkerTickAt)) : "—", "default"],
                ["Last successful refresh", data.summary.lastSuccessfulRefreshAt ? timeAgo(new Date(data.summary.lastSuccessfulRefreshAt)) : "—", "default"],
                ["Fresh sources (<1h)", data.summary.freshSources1h, data.summary.freshSources1h > 0 ? "green" : "default"],
                ["Fresh sources (<6h)", data.summary.freshSources6h, data.summary.freshSources6h > 0 ? "green" : "default"],
                ["Stale sources (>24h)", data.summary.staleSources24h, data.summary.staleSources24h > 0 ? "yellow" : "default"],
                ["Boards refreshed (24h)", data.summary.boardsRefreshed24h, data.summary.boardsRefreshed24h > 0 ? "green" : "default"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{label}</div>
                  <div
                    className={`text-xl font-semibold tabular-nums mt-1 ${
                      tone === "green"
                        ? "text-emerald-600"
                        : tone === "red"
                          ? "text-red-600"
                          : tone === "yellow"
                            ? "text-amber-600"
                            : "text-foreground"
                    }`}
                  >
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <SectionHeader
              title="Source reliability"
              description="Scheduler health: cooldowns, empty streaks, auto-disabled connectors, and recovered stuck jobs."
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-9 gap-3 text-sm">
              {[
                ["Healthy", data.summary.reliabilityHealthy, "green"],
                ["Degraded", data.summary.reliabilityDegraded, "yellow"],
                ["Cooling down", data.summary.reliabilityCoolingDown, "yellow"],
                ["Disabled", data.summary.reliabilityDisabled, data.summary.reliabilityDisabled > 0 ? "red" : "default"],
                ["Stale jobs fixed (24h)", data.summary.staleRunningJobsRecovered24h, "default"],
                ["Empty streak ≥5", data.summary.sourcesInEmptyStreak5Plus, data.summary.sourcesInEmptyStreak5Plus > 0 ? "yellow" : "default"],
                ["Avg fail streak", data.summary.avgConsecutiveFailures, "default"],
                ["Avg empty streak", data.summary.avgConsecutiveEmptyRuns, "default"],
                ["Reliability alerts open", data.summary.sourceReliabilityAlertsOpen, data.summary.sourceReliabilityAlertsOpen > 0 ? "yellow" : "default"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{label}</div>
                  <div
                    className={`text-xl font-semibold tabular-nums mt-1 ${
                      tone === "green"
                        ? "text-emerald-600"
                        : tone === "red"
                          ? "text-red-600"
                          : tone === "yellow"
                            ? "text-amber-600"
                            : "text-foreground"
                    }`}
                  >
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Worst sources" description="Lowest healthScore first (best-effort heuristic)." />
              <div className="rounded border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[1040px]">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border text-left">
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Source</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Band</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Reliability</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">CF / empty</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Cooldown</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Score</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Raw</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Cand</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Last success</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.worstSources.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-2/60">
                        <td className="px-3 py-2">
                          <Link href={`/sources/${s.id}`} className="font-medium text-foreground hover:opacity-80">
                            {s.name}
                          </Link>
                          <div className="text-[11px] text-muted-2">{s.type}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge label={s.band} variant={bandVariant(s.band)} />
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            label={s.reliabilityStatus}
                            variant={
                              s.reliabilityStatus === "HEALTHY"
                                ? "green"
                                : s.reliabilityStatus === "DISABLED"
                                  ? "red"
                                  : "yellow"
                            }
                          />
                          {s.disabledReason ? (
                            <div className="text-[10px] text-muted-2 mt-0.5 max-w-[140px] truncate" title={s.disabledReason}>
                              {s.disabledReason}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-[11px] text-muted">
                          {s.consecutiveFailures} / {s.consecutiveEmptyRuns}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted whitespace-nowrap">{cooldownLabel(s.cooldownUntil)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.healthScore}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{s.rawCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{s.candidatesDiscovered}</td>
                        <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                          {s.lastSuccessAt ? timeAgo(s.lastSuccessAt) : "—"}
                        </td>
                        <td className="px-3 py-2 text-[11px] text-muted max-w-[200px] truncate" title={s.reasons.join(", ")}>
                          {s.reasons.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Best sources" description="Highest healthScore first." />
              <div className="rounded border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[780px]">
                  <thead>
                    <tr className="bg-surface-2 border-b border-border text-left">
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Source</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Band</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Score</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Raw</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Cand</th>
                      <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Last success</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.bestSources.map((s) => (
                      <tr key={s.id} className="hover:bg-surface-2/60">
                        <td className="px-3 py-2">
                          <Link href={`/sources/${s.id}`} className="font-medium text-foreground hover:opacity-80">
                            {s.name}
                          </Link>
                          <div className="text-[11px] text-muted-2">{s.type}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge label={s.band} variant={bandVariant(s.band)} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.healthScore}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{s.rawCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted">{s.candidatesDiscovered}</td>
                        <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                          {s.lastSuccessAt ? timeAgo(s.lastSuccessAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Recently failed jobs (24h)" description="Most recent FAILED ingestion jobs." />
              <div className="space-y-2">
                {data.failedJobs.length === 0 ? (
                  <div className="text-sm text-muted">—</div>
                ) : (
                  data.failedJobs.map((j) => (
                    <div key={j.id} className="rounded border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <Link href={`/sources/${j.sourceId}`} className="text-sm font-medium text-foreground hover:opacity-80">
                          {j.sourceName}
                        </Link>
                        <Badge label="FAILED" variant="red" />
                      </div>
                      <div className="text-[11px] text-muted mt-1">{j.sourceType}</div>
                      <div className="text-xs text-muted mt-1 truncate" title={j.error ?? ""}>
                        {j.error ?? "—"}
                      </div>
                      <div className="text-[11px] text-muted-2 mt-1">{timeAgo(j.createdAt)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="High-confidence candidates" description="Top discovery candidates not yet promoted." />
              <div className="space-y-2">
                {data.topCandidates.length === 0 ? (
                  <div className="text-sm text-muted">—</div>
                ) : (
                  data.topCandidates.map((c) => (
                    <div key={c.id} className="rounded border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-foreground">{c.domain}</div>
                        <Badge label={String(c.discoveryScore)} variant="green" />
                      </div>
                      <div className="text-xs text-muted mt-1 truncate" title={c.discoveryReason}>
                        {c.discoveryReason}
                      </div>
                      <div className="text-[11px] text-muted-2 mt-1">
                        evidence {c.rawEvidenceCount} · {timeAgo(c.createdAt)}
                      </div>
                      <Link href="/sources/discovery-candidates" className="text-xs text-muted hover:opacity-80 inline-block mt-2">
                        Open candidates →
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Recently promoted sources" description="New SHOPIFY_DOMAIN sources created in last 7 days." />
              <div className="space-y-2">
                {data.promotedSources.length === 0 ? (
                  <div className="text-sm text-muted">—</div>
                ) : (
                  data.promotedSources.map((s) => (
                    <div key={s.id} className="rounded border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <Link href={`/sources/${s.id}`} className="text-sm font-medium text-foreground hover:opacity-80">
                          {s.domain ?? s.name}
                        </Link>
                        <Badge label="Promoted" variant="purple" />
                      </div>
                      <div className="text-[11px] text-muted mt-1">{s.type}</div>
                      <div className="text-[11px] text-muted-2 mt-1">{timeAgo(s.createdAt)}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <SectionHeader title="Stalled sources" description="Sources not synced for a long time (or never)." />
              <div className="space-y-2">
                {data.stalledSources.length === 0 ? (
                  <div className="text-sm text-muted">—</div>
                ) : (
                  data.stalledSources.map((s) => (
                    <div key={s.id} className="rounded border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <Link href={`/sources/${s.id}`} className="text-sm font-medium text-foreground hover:opacity-80">
                          {s.name}
                        </Link>
                        <Badge label={String(s.healthScore)} variant={bandVariant(s.band)} />
                      </div>
                      <div className="text-[11px] text-muted mt-1">{s.type}</div>
                      <div className="text-xs text-muted mt-1">
                        lastSync {s.lastSyncAt ? formatDate(s.lastSyncAt) : "—"} · lastSuccess{" "}
                        {s.lastSuccessAt ? formatDate(s.lastSuccessAt) : "—"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

