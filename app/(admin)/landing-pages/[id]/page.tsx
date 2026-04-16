import { notFound } from "next/navigation";
import Link from "next/link";
import { LandingPageRepository } from "@/server/repositories/landing-page.repository";
import PageHeader from "@/components/ui/PageHeader";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import EntityLinksBlock from "@/components/internal/EntityLinksBlock";
import { formatDate, timeAgo } from "@/lib/date";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import type { EntityType } from "@/types";
import { IntelligenceContextRepository } from "@/server/repositories/intelligence-context.repository";
import IntelligenceContextPanel from "@/components/internal/IntelligenceContextPanel";
import EntityWarningChips from "@/components/internal/EntityWarningChips";
import OfferAnalyzerDrawer from "@/components/internal/OfferAnalyzerDrawer";
import PersonaAnalyzerDrawer from "@/components/internal/PersonaAnalyzerDrawer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function countByEntityType(
  links: { entityType: EntityType }[]
): Partial<Record<EntityType, number>> {
  const m: Partial<Record<EntityType, number>> = {};
  for (const l of links) {
    m[l.entityType] = (m[l.entityType] ?? 0) + 1;
  }
  return m;
}

export default async function LandingPageDetailPage({ params }: Props) {
  const { id } = await params;
  const lp = await LandingPageRepository.findById(id);

  if (!lp) notFound();

  const intel = await IntelligenceContextRepository.getForEntity("LANDING_PAGE", lp.id);

  type LPDetail = typeof lp;

  const score = lp.confidenceScores[0];
  const links = lp.entityLinks ?? [];
  const ads = lp.ads ?? [];
  const graphCounts = countByEntityType(links);
  const orphanHints: string[] = [];
  if (ads.length === 0) orphanHints.push("No linked ads");
  type LinkItem = (typeof links)[number];
  type OutgoingItem = NonNullable<typeof intel.inferredOutgoing>[number];
  const hasStoreLineage =
    links.some((l: LinkItem) => l.entityType === "STORE") ||
    (intel.inferredOutgoing ?? []).some((x: OutgoingItem) => x.toEntityType === "STORE");
  if (!hasStoreLineage) orphanHints.push("No store lineage");

  return (
    <div>
      <PageHeader
        title={lp.title ?? lp.domain}
        description={lp.url}
        action={
          <div className="flex items-center gap-3">
            <a
              href={lp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm"
            >
              Open URL ↗
            </a>
            <OfferAnalyzerDrawer entityType="LANDING_PAGE" entityId={lp.id} triggerLabel="Offer Analyzer" title={`Offer audit · ${lp.domain}`} />
            <PersonaAnalyzerDrawer entityType="LANDING_PAGE" entityId={lp.id} triggerLabel="Audience" title={`Audience · ${lp.domain}`} />
            <Link href="/landing-pages" className="text-sm text-muted hover:opacity-80">
              ← Back
            </Link>
          </div>
        }
      />

      {orphanHints.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-4 py-3 flex flex-wrap items-center gap-3 mb-6">
          <span className="text-[11px] font-semibold text-amber-500 uppercase">Graph warnings</span>
          <EntityWarningChips items={orphanHints} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
            Summary
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ["Domain", lp.domain],
              ["Linked ads", ads.length.toLocaleString()],
              ["Entity links", links.length.toLocaleString()],
              ["First seen", timeAgo(lp.firstSeenAt)],
              ["Last seen", timeAgo(lp.lastSeenAt)],
            ].map(([label, value]) => (
              <div key={String(label)} className="contents">
                <dt className="text-xs text-muted-2">{label}</dt>
                <dd className="text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
            Confidence
          </h3>
          <ConfidenceInline score={score ?? null} />
          {score && (
            <div className="mt-4 text-[11px] text-muted-2 space-y-1 tabular-nums">
              <div>URL validity {(score.urlValidityScore * 100).toFixed(0)}%</div>
              <div>Linkage {(score.linkageScore * 100).toFixed(0)}%</div>
              <div className="text-muted pt-1">Updated {formatDate(score.lastScoredAt)}</div>
            </div>
          )}
        </div>
      </div>

      <IntelligenceContextPanel
        mergeEntityType="LANDING_PAGE"
        inferredOutgoing={intel.inferredOutgoing}
        inferredIncoming={intel.inferredIncoming}
        mergeCandidates={intel.mergeCandidates}
        signals={intel.signals}
        breakdownV2={score?.breakdownV2 ?? undefined}
        reasonCodes={score?.reasonCodes ?? undefined}
      />

      <div className="rounded-lg border border-border bg-card p-4 mb-6 shadow-sm">
        <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
          Entity graph (from links)
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(graphCounts).length === 0 ? (
            <span className="text-xs text-muted-2">No normalized links yet.</span>
          ) : (
            Object.entries(graphCounts).map(([type, n]) => (
              <span
                key={type}
                className="text-xs px-2 py-1 rounded bg-surface-2 text-foreground tabular-nums border border-border"
              >
                {type}: {n}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Linked ads
          </h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">
                    Page / creative
                  </th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ads.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-muted-2 text-xs">
                      No ads reference this URL.
                    </td>
                  </tr>
                ) : (
                  ads.map((ad: LPDetail["ads"][number]) => (
                    <tr key={ad.id} className="hover:bg-surface-2/70">
                      <td className="px-3 py-2">
                        <div className="text-foreground truncate max-w-md">
                          {ad.pageName ?? ad.externalId}
                        </div>
                        <div className="text-[11px] text-muted-2 font-mono truncate">
                          {ad.canonicalUrl ?? ad.externalId}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/ads/${ad.id}`} className="text-xs text-indigo-600 hover:opacity-80">
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

        <div className="space-y-4">
          <EntityLinksBlock
            links={links.map((l: LPDetail["entityLinks"][number]) => ({
              id: l.id,
              entityType: l.entityType,
              entityId: l.entityId,
            }))}
            title="Raw lineage"
          />
          {score?.breakdown != null && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase mb-2 tracking-wide">
                Score breakdown
              </h3>
              <JsonPayloadViewer data={score.breakdown} maxCollapsedHeight={220} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
