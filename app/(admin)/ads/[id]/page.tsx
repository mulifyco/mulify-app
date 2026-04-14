import { notFound } from "next/navigation";
import { AdRepository } from "@/server/repositories/ad.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { formatDate, timeAgo } from "@/lib/date";
import Link from "next/link";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import EntityLinksBlock from "@/components/internal/EntityLinksBlock";
import EntityWarningChips from "@/components/internal/EntityWarningChips";
import SectionHeader from "@/components/internal/SectionHeader";
import { adRowWarnings, platformsLabel } from "@/lib/admin/entity-warnings";
import type { Platform } from "@/types";
import { IntelligenceContextRepository } from "@/server/repositories/intelligence-context.repository";
import IntelligenceContextPanel from "@/components/internal/IntelligenceContextPanel";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdDetailPage({ params }: Props) {
  const { id } = await params;
  const ad = await AdRepository.findById(id);

  if (!ad) notFound();

  const [relatedJobs, intel] = await Promise.all([
    AdRepository.getRelatedJobsForAd(ad.id, 15),
    IntelligenceContextRepository.getForEntity("AD", ad.id),
  ]);

  type RelatedIngestionJobRow = Awaited<ReturnType<typeof AdRepository.getRelatedJobsForAd>>[number];

  type AdDetail = typeof ad;
  const score = ad.confidenceScores[0];
  const listWarnings = adRowWarnings({
    ...ad,
    landingPages: ad.landingPages,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title={ad.pageName ?? "Ad"}
        description={`${ad.externalId} · id ${ad.id}`}
        action={
          <Link href="/ads" className="text-sm text-muted hover:opacity-80">
            ← Back to Ads
          </Link>
        }
      />

      {listWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold text-amber-500 uppercase">Flags</span>
          <EntityWarningChips items={listWarnings} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {[
          ["Activity", ad.isActive != null ? statusBadge(ad.isActive ? "ACTIVE" : "PAUSED") : "Unknown"],
          ["Platforms", platformsLabel((ad.platforms ?? []) as Platform[])],
          ["First seen", timeAgo(ad.firstSeenAt)],
          ["Last seen", timeAgo(ad.lastSeenAt)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
            <div className="text-[11px] text-muted uppercase">{label}</div>
            <div className="mt-1 text-foreground text-sm">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
              Advertiser / page
            </h3>
            <dl className="space-y-2 text-sm">
              {[
                ["Page name", ad.pageName],
                ["Page ID", ad.pageId],
                ["Page URL", ad.pageUrl],
                ["External ID", ad.externalId],
                ["Countries", (ad.countries ?? []).join(", ") || "—"],
                ["Currency", ad.currency],
                ["Start", formatDate(ad.startDate)],
                ["End", formatDate(ad.endDate)],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex gap-3">
                  <dt className="w-28 text-muted-2 flex-none text-xs">{label}</dt>
                  <dd className="text-foreground text-xs break-all">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
              Creative text
            </h3>
            {ad.adTitle && (
              <div className="mb-3">
                <div className="text-xs text-muted-2 mb-1">Title</div>
                <div className="text-sm text-foreground">{ad.adTitle}</div>
              </div>
            )}
            {ad.adText && (
              <div className="mb-3">
                <div className="text-xs text-muted-2 mb-1">Text</div>
                <div className="text-sm text-foreground whitespace-pre-wrap">{ad.adText}</div>
              </div>
            )}
            {ad.adBody && (
              <div className="mb-3">
                <div className="text-xs text-muted-2 mb-1">Body</div>
                <div className="text-sm text-muted">{ad.adBody}</div>
              </div>
            )}
            {!ad.adTitle && !ad.adText && !ad.adBody && (
              <div className="text-muted-2 text-sm">No text fields</div>
            )}
          </div>

          {(ad.impressionsMin || ad.spendMin) && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-muted uppercase mb-3">Reach estimates</h3>
              <dl className="space-y-2 text-sm">
                {ad.impressionsMin != null && (
                  <div className="flex gap-3">
                    <dt className="w-28 text-muted-2">Impressions</dt>
                    <dd className="text-foreground">
                      {ad.impressionsMin.toLocaleString()} –{" "}
                      {ad.impressionsMax?.toLocaleString() ?? "?"}
                    </dd>
                  </div>
                )}
                {ad.spendMin != null && (
                  <div className="flex gap-3">
                    <dt className="w-28 text-muted-2">Spend</dt>
                    <dd className="text-foreground">
                      {ad.currency} {ad.spendMin.toLocaleString()} –{" "}
                      {ad.spendMax?.toLocaleString() ?? "?"}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
              Destination URLs
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-2 mb-1">Destination</dt>
                <dd className="text-xs font-mono text-indigo-600 break-all">
                  {ad.destinationUrl ? (
                    <a href={ad.destinationUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {ad.destinationUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-2 mb-1">Canonical</dt>
                <dd className="text-xs font-mono text-muted break-all">
                  {ad.canonicalUrl ? (
                    <a href={ad.canonicalUrl} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">
                      {ad.canonicalUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {score && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-muted uppercase mb-3">Confidence</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="text-3xl font-bold text-foreground tabular-nums">
                  {(score.overallScore * 100).toFixed(0)}%
                </div>
                {statusBadge(score.level)}
              </div>
              <dl className="space-y-1.5 text-xs">
                {(
                  [
                    ["Source", score.sourceScore],
                    ["Completeness", score.completenessScore],
                    ["Confirmation", score.confirmationScore],
                    ["URL validity", score.urlValidityScore],
                    ["Linkage", score.linkageScore],
                  ] as const
                ).map(([label, sc]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-24 text-muted-2">{label}</span>
                    <div className="flex-1 bg-surface-2 rounded-full h-1.5 border border-border">
                      <div
                        className="bg-indigo-500 h-1.5 rounded-full"
                        style={{ width: `${sc * 100}%` }}
                      />
                    </div>
                    <span className="text-muted w-8 text-right">{(sc * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </dl>
              <div className="mt-3 text-xs text-muted-2">Sync confirmations: {score.syncCount}</div>
              {score.breakdown != null && (
                <div className="mt-4">
                  <SectionHeader title="Breakdown (JSON)" />
                  <JsonPayloadViewer data={score.breakdown} maxCollapsedHeight={200} />
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-yellow-900/40 bg-yellow-950/10 p-4 text-xs text-yellow-700">
            <div className="font-semibold text-yellow-600 uppercase mb-2">Meta API note</div>
            Destination URLs may be snapshot pages for non-political ads. Phase 2 can crawl deeper.
          </div>
        </div>
      </div>

      <IntelligenceContextPanel
        mergeEntityType="AD"
        inferredOutgoing={intel.inferredOutgoing}
        inferredIncoming={intel.inferredIncoming}
        mergeCandidates={intel.mergeCandidates}
        signals={intel.signals}
        breakdownV2={score?.breakdownV2 ?? undefined}
        reasonCodes={score?.reasonCodes ?? undefined}
        winningProbabilityScore={ad.winningProbabilityScore}
        opportunityLevel={ad.opportunityLevel}
        fusionReasonCodes={ad.fusionReasonCodes}
        fusionBreakdown={ad.fusionBreakdown ?? undefined}
        opportunityUpdatedAt={ad.opportunityUpdatedAt}
      />

      <div>
        <SectionHeader title="Linked landing pages" description="Normalized graph" />
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Domain</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">URL</th>
                <th className="px-3 py-2 w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(ad.landingPages ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted-2 text-xs">
                    No landing page rows linked.
                  </td>
                </tr>
              ) : (
                (ad.landingPages ?? []).map((lp: AdDetail["landingPages"][number]) => (
                  <tr key={lp.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2 text-xs text-muted">{lp.domain}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-2 truncate max-w-md">{lp.url}</td>
                    <td className="px-3 py-2">
                      <Link href={`/landing-pages/${lp.id}`} className="text-xs text-indigo-600 hover:opacity-80">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EntityLinksBlock
        links={(ad.entityLinks ?? []).map((l: AdDetail["entityLinks"][number]) => ({
          id: l.id,
          entityType: l.entityType,
          entityId: l.entityId,
        }))}
        title="Entity lineage (stores, products, raw)"
      />

      <div>
        <SectionHeader title="Raw source references" />
        <ul className="space-y-2">
          {(ad.entityLinks ?? []).map((l: AdDetail["entityLinks"][number]) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center gap-2 text-xs rounded border border-border bg-card px-3 py-2 shadow-sm"
            >
              <span className="font-mono text-muted">{l.rawRecord?.externalId ?? "—"}</span>
              {statusBadge(l.rawRecord?.status ?? "UNKNOWN")}
              {l.rawRecord?.id ? (
                <Link href={`/raw-records/${l.rawRecord.id}`} className="text-indigo-600 hover:opacity-80">
                Inspect payload
                </Link>
              ) : (
                <span className="text-muted-2">—</span>
              )}
            </li>
          ))}
          {(ad.entityLinks ?? []).length === 0 && (
            <p className="text-sm text-muted-2">No entity links to raw records.</p>
          )}
        </ul>
      </div>

      <div>
        <SectionHeader title="Related ingestion jobs" description="Via raw record lineage" />
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Job</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Source</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Status</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Started</th>
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(relatedJobs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-2 text-xs">
                    No jobs linked.
                  </td>
                </tr>
              ) : (
                (relatedJobs ?? []).map((j: RelatedIngestionJobRow) => (
                  <tr key={j.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2 font-mono text-[11px] text-muted">{j.id.slice(0, 12)}…</td>
                    <td className="px-3 py-2 text-xs text-muted">{j.source.name}</td>
                    <td className="px-3 py-2">{statusBadge(j.status)}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {j.startedAt ? formatDate(j.startedAt) : formatDate(j.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/jobs/${j.id}`} className="text-xs text-indigo-600 hover:opacity-80">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {ad.metadata != null && (
        <div>
          <SectionHeader title="Ad metadata (JSON)" />
          <JsonPayloadViewer data={ad.metadata} maxCollapsedHeight={240} />
        </div>
      )}
    </div>
  );
}
