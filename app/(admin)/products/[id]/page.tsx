import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductRepository } from "@/server/repositories/product.repository";
import PageHeader from "@/components/ui/PageHeader";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import EntityLinksBlock from "@/components/internal/EntityLinksBlock";
import EntityWarningChips from "@/components/internal/EntityWarningChips";
import { formatDate, timeAgo } from "@/lib/date";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import { statusBadge } from "@/components/ui/Badge";
import { productRowWarnings } from "@/lib/admin/entity-warnings";
import { IntelligenceContextRepository } from "@/server/repositories/intelligence-context.repository";
import IntelligenceContextPanel from "@/components/internal/IntelligenceContextPanel";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const product = await ProductRepository.findById(id);

  if (!product) notFound();

  const intelCtx = await IntelligenceContextRepository.getForEntity("PRODUCT", product.id);

  const dupCount = await ProductRepository.countDuplicateHandlesForProduct(
    product.storeId,
    product.handle
  );

  type ProductDetail = typeof product;
  type EntityLinkRow = ProductDetail["entityLinks"][number];

  const score = product.confidenceScores[0];
  const landingLinks = product.entityLinks.filter((l: EntityLinkRow) => l.entityType === "LANDING_PAGE");
  const warnings = productRowWarnings({
    priceMin: product.priceMin,
    priceMax: product.priceMax,
    featuredImage: product.featuredImage,
    isAvailable: product.isAvailable,
    confidenceScores: product.confidenceScores,
    _count: { collectionMemberships: product.collectionMemberships.length },
    duplicateHandle: dupCount > 1,
  });

  return (
    <div>
      <PageHeader
        title={product.title}
        description={`@${product.handle} · ${product.store.domain}`}
        action={
          <div className="flex items-center gap-3">
            {product.url && (
              <a
                href={product.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
              >
                Product URL ↗
              </a>
            )}
            <Link href="/products" className="text-sm text-gray-400 hover:text-gray-200">
              ← Back
            </Link>
          </div>
        }
      />

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-4 py-3 flex flex-wrap items-center gap-3 mb-6">
          <span className="text-[11px] font-semibold text-amber-500 uppercase">Flags</span>
          <EntityWarningChips items={warnings} />
        </div>
      )}

      {dupCount > 1 && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/15 px-4 py-3 text-sm text-red-200/90 mb-6">
          <span className="text-xs font-semibold text-red-400 uppercase">Duplicate handle</span>
          <p className="text-xs mt-1 text-red-200/70">
            {dupCount} product rows share store <span className="font-mono">{product.store.domain}</span> /{" "}
            <span className="font-mono">{product.handle}</span>. Inspect ingestion overlap.
          </p>
          <Link
            href={`/products?storeId=${product.storeId}&dup=1&search=${encodeURIComponent(product.handle)}`}
            className="text-xs text-indigo-400 mt-2 inline-block"
          >
            Filter duplicates →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">
            Normalized product
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ["Vendor", product.vendor ?? "—"],
              ["External ID", product.externalId ?? "—"],
              [
                "Price",
                product.priceMin != null || product.priceMax != null
                  ? `${product.priceMin ?? "?"}\u2009–\u2009${product.priceMax ?? "?"} ${product.currency ?? ""}`.trim()
                  : "—",
              ],
              [
                "Available",
                product.isAvailable !== null
                  ? product.isAvailable
                    ? "Yes"
                    : "No"
                  : "—",
              ],
              ["First seen", timeAgo(product.firstSeenAt)],
              ["Last seen", timeAgo(product.lastSeenAt)],
            ].map(([label, value]) => (
              <div key={String(label)} className="contents">
                <dt className="text-xs text-gray-600">{label}</dt>
                <dd className="text-gray-300">{value}</dd>
              </div>
            ))}
            <dt className="text-xs text-gray-600">Store</dt>
            <dd>
              <Link href={`/stores/${product.store.id}`} className="text-indigo-400 text-sm">
                {product.store.domain}
              </Link>
            </dd>
          </dl>
          {product.description && (
            <p className="mt-4 text-xs text-gray-500 leading-relaxed line-clamp-6">{product.description}</p>
          )}
        </div>

        <div className="space-y-4">
          {product.featuredImage && (
            <div className="rounded-lg border border-gray-800 overflow-hidden bg-gray-950">
              <div className="text-[10px] font-semibold text-gray-500 uppercase px-3 py-2 border-b border-gray-800">
                Image
              </div>
              <div className="p-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.featuredImage}
                  alt=""
                  className="max-h-64 max-w-full object-contain"
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">
              Confidence
            </h3>
            <ConfidenceInline score={score ?? null} />
            {score && (
              <div className="mt-4 text-[11px] text-gray-600 space-y-1 tabular-nums">
                <div>Completeness {(score.completenessScore * 100).toFixed(0)}%</div>
                <div>Source {(score.sourceScore * 100).toFixed(0)}%</div>
                <div>Linkage {(score.linkageScore * 100).toFixed(0)}%</div>
                <div className="text-gray-500 pt-1">Updated {formatDate(score.lastScoredAt)}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <IntelligenceContextPanel
        mergeEntityType="PRODUCT"
        inferredOutgoing={intelCtx.inferredOutgoing}
        inferredIncoming={intelCtx.inferredIncoming}
        mergeCandidates={intelCtx.mergeCandidates}
        signals={intelCtx.signals}
        breakdownV2={score?.breakdownV2 ?? undefined}
        reasonCodes={score?.reasonCodes ?? undefined}
        trafficScore={product.trafficScore}
        trafficTrend={product.trafficTrend}
        trafficReasonCodes={product.trafficReasonCodes}
        trafficBreakdown={product.trafficBreakdown ?? undefined}
        trafficUpdatedAt={product.trafficUpdatedAt}
        prominenceScore={product.prominenceScore}
        prominenceLevel={product.prominenceLevel}
        prominenceReasonCodes={product.prominenceReasonCodes}
        prominenceBreakdown={product.prominenceBreakdown ?? undefined}
        prominenceUpdatedAt={product.prominenceUpdatedAt}
        winningProbabilityScore={product.winningProbabilityScore}
        opportunityLevel={product.opportunityLevel}
        fusionReasonCodes={product.fusionReasonCodes}
        fusionBreakdown={product.fusionBreakdown ?? undefined}
        opportunityUpdatedAt={product.opportunityUpdatedAt}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Collections ({product.collectionMemberships.length})
          </h2>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">
                    Title
                  </th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {product.collectionMemberships.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-gray-600 text-xs">
                      No collection memberships.
                    </td>
                  </tr>
                ) : (
                  product.collectionMemberships.map((m: ProductDetail["collectionMemberships"][number]) => (
                    <tr key={m.collection.id} className="hover:bg-gray-900/40">
                      <td className="px-3 py-2">
                        <div className="text-gray-200">{m.collection.title}</div>
                        <div className="text-[11px] text-gray-600 font-mono">{m.collection.handle}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/collections/${m.collection.id}`} className="text-xs text-indigo-400">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {landingLinks.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wide">
                Landing page links
              </h3>
              <ul className="text-sm space-y-1">
                {landingLinks.map((l) => (
                  <li key={l.id}>
                    <Link href={`/landing-pages/${l.entityId}`} className="text-indigo-400 font-mono text-xs">
                      {l.entityId}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <EntityLinksBlock
            links={product.entityLinks.map((l: EntityLinkRow) => ({
              id: l.id,
              entityType: l.entityType,
              entityId: l.entityId,
            }))}
            title="Normalized lineage (entity links)"
          />

          {product.entityLinks.length > 0 && (
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Raw payloads
              </div>
              <ul className="divide-y divide-gray-800/60">
                {product.entityLinks.map((l: EntityLinkRow) => (
                  <li
                    key={l.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-mono text-gray-500 truncate min-w-0">
                      {l.rawRecord.externalId}
                    </span>
                    <span className="shrink-0">{statusBadge(l.rawRecord.status)}</span>
                    <Link
                      href={`/raw-records/${l.rawRecord.id}`}
                      className="text-indigo-400 shrink-0"
                    >
                      Inspect
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {score?.breakdown != null && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wide">
                Score breakdown
              </h3>
              <JsonPayloadViewer data={score.breakdown} maxCollapsedHeight={240} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
