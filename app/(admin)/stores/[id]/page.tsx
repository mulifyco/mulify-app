import { notFound } from "next/navigation";
import { StoreRepository } from "@/server/repositories/store.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { timeAgo, formatDate } from "@/lib/date";
import Link from "next/link";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import EntityLinksBlock from "@/components/internal/EntityLinksBlock";
import EntityWarningChips from "@/components/internal/EntityWarningChips";
import SectionHeader from "@/components/internal/SectionHeader";
import { storeRowWarnings } from "@/lib/admin/entity-warnings";
import { IntelligenceContextRepository } from "@/server/repositories/intelligence-context.repository";
import IntelligenceContextPanel from "@/components/internal/IntelligenceContextPanel";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ productPage?: string }>;
}

export default async function StoreDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { productPage } = await searchParams;

  const [{ store, products }, full, lpLinks, collections, intel, catalogProminence] =
    await Promise.all([
      StoreRepository.getWithProducts(id, parseInt(productPage ?? "1", 10), 30),
      StoreRepository.findById(id),
      StoreRepository.getLandingPageLinks(id, 50),
      StoreRepository.getRecentCollections(id, 30),
      IntelligenceContextRepository.getForEntity("STORE", id),
      StoreRepository.getCatalogProminenceStats(id),
    ]);

  if (!store || !full) notFound();

  const score = full.confidenceScores[0];
  const warnings = storeRowWarnings({
    _count: store._count,
    confidenceScores: full.confidenceScores,
    lastSeenAt: store.lastSeenAt,
    lastCrawledAt: store.lastCrawledAt,
    landingPageLinkCount: lpLinks.length,
  });

  type FullStore = typeof full;

  return (
    <div className="space-y-8">
      <PageHeader
        title={store.domain}
        description={store.name ?? "Shopify store"}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href={`https://${store.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
            >
              Visit store ↗
            </a>
            <Link href="/stores" className="text-sm text-gray-400 hover:text-gray-200">
              ← Back
            </Link>
          </div>
        }
      />

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-semibold text-amber-500 uppercase">Flags</span>
          <EntityWarningChips items={warnings} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">Summary</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ["Domain", store.domain],
              ["Platform", store.platform],
              ["Status", statusBadge(store.isActive ? "ACTIVE" : "PAUSED")],
              ["Currency", store.currency ?? "—"],
              ["Country", store.country ?? "—"],
              ["Products", store._count.products.toLocaleString()],
              ["Collections", store._count.collections.toLocaleString()],
              ["LP graph links", String(lpLinks.length)],
              ["First seen", timeAgo(store.firstSeenAt)],
              ["Last seen", timeAgo(store.lastSeenAt)],
              ["Last crawl", store.lastCrawledAt ? timeAgo(store.lastCrawledAt) : "—"],
            ].map(([label, value]) => (
              <div key={String(label)} className="contents">
                <dt className="text-xs text-gray-600">{label}</dt>
                <dd className="text-gray-300">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {score && (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Confidence</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="text-3xl font-bold text-white tabular-nums">
                {(score.overallScore * 100).toFixed(0)}%
              </div>
              {statusBadge(score.level)}
            </div>
            <dl className="space-y-1 text-[11px] text-gray-600 tabular-nums">
              <div>Completeness {(score.completenessScore * 100).toFixed(0)}%</div>
              <div>Source {(score.sourceScore * 100).toFixed(0)}%</div>
              <div>Linkage {(score.linkageScore * 100).toFixed(0)}%</div>
              <div className="text-gray-500 pt-1">Updated {formatDate(score.lastScoredAt)}</div>
            </dl>
            {score.breakdown != null && (
              <div className="mt-4">
                <SectionHeader title="Breakdown" />
                <JsonPayloadViewer data={score.breakdown} maxCollapsedHeight={180} />
              </div>
            )}
          </div>
        )}
      </div>

      <IntelligenceContextPanel
        mergeEntityType="STORE"
        inferredOutgoing={intel.inferredOutgoing}
        inferredIncoming={intel.inferredIncoming}
        mergeCandidates={intel.mergeCandidates}
        signals={intel.signals}
        breakdownV2={score?.breakdownV2 ?? undefined}
        reasonCodes={score?.reasonCodes ?? undefined}
        trafficScore={store.trafficScore}
        trafficTrend={store.trafficTrend}
        trafficReasonCodes={store.trafficReasonCodes}
        trafficBreakdown={store.trafficBreakdown ?? undefined}
        trafficUpdatedAt={store.trafficUpdatedAt}
        catalogProminence={catalogProminence}
        winningProbabilityScore={store.winningProbabilityScore}
        opportunityLevel={store.opportunityLevel}
        fusionReasonCodes={store.fusionReasonCodes}
        fusionBreakdown={store.fusionBreakdown ?? undefined}
        opportunityUpdatedAt={store.opportunityUpdatedAt}
      />

      <div>
        <SectionHeader title="Landing pages (entity graph)" />
        <div className="rounded-lg border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Domain</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">URL</th>
                <th className="px-3 py-2 w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {lpLinks.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-gray-600 text-xs">
                    No landing page entity links.
                  </td>
                </tr>
              ) : (
                lpLinks.filter((row) => row.landingPage).map((row) => {
                  const lp = row.landingPage!;
                  return (
                    <tr key={row.id} className="hover:bg-gray-900/40">
                      <td className="px-3 py-2 text-xs text-gray-400">{lp.domain}</td>
                      <td className="px-3 py-2 text-xs font-mono text-gray-500 truncate max-w-lg">
                        {lp.url}
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/landing-pages/${lp.id}`} className="text-xs text-indigo-400">
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionHeader title="Collections" description="Recent by last seen" />
        <div className="rounded-lg border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Title</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase text-right">
                  Products
                </th>
                <th className="px-3 py-2 w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {collections.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-gray-600 text-xs">
                    No collections.
                  </td>
                </tr>
              ) : (
                collections.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-900/40">
                    <td className="px-3 py-2">
                      <div className="text-gray-200">{c.title}</div>
                      <div className="text-[11px] text-gray-600 font-mono">{c.handle}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                      {c._count.products}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/collections/${c.id}`} className="text-xs text-indigo-400">
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

      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Products ({products.total.toLocaleString()})
        </h2>
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">Available</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase">First seen</th>
                <th className="px-4 py-3 text-left text-xs text-gray-500 uppercase" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {products.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-600">
                    No products indexed yet
                  </td>
                </tr>
              ) : (
                products.data.map((product) => (
                  <tr key={product.id} className="bg-gray-950 hover:bg-gray-900/60">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${product.id}`}
                        className="text-gray-200 hover:text-indigo-300 truncate max-w-xs block"
                      >
                        {product.title}
                      </Link>
                      <div className="text-xs text-gray-600">{product.handle}</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-400 text-xs">
                      {product.priceMin != null ? `${product.priceMin}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {product.isAvailable !== null
                        ? statusBadge(product.isAvailable ? "ACTIVE" : "PAUSED")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{timeAgo(product.firstSeenAt)}</td>
                    <td className="px-4 py-3">
                      <a
                        href={product.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 hover:text-gray-300"
                      >
                        ↗
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {products.totalPages > 1 && (
          <div className="mt-4 flex justify-center gap-2 text-xs text-gray-600">
            {Array.from({ length: Math.min(products.totalPages, 8) }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`/stores/${id}?productPage=${p}`}
                className={
                  p === products.page
                    ? "text-indigo-400 font-medium"
                    : "text-gray-500 hover:text-gray-300"
                }
              >
                {p}
              </Link>
            ))}
            {products.totalPages > 8 && <span className="text-gray-600">…</span>}
          </div>
        )}
      </div>

      <EntityLinksBlock
        links={full.entityLinks.map((l: FullStore["entityLinks"][number]) => ({
          id: l.id,
          entityType: l.entityType,
          entityId: l.entityId,
        }))}
        title="Raw lineage"
      />

      <div>
        <SectionHeader title="Raw payloads" />
        <ul className="space-y-2">
          {full.entityLinks.map((l: FullStore["entityLinks"][number]) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center gap-2 text-xs rounded border border-gray-800 bg-gray-900/30 px-3 py-2"
            >
              <span className="font-mono text-gray-500">{l.rawRecord.externalId}</span>
              {statusBadge(l.rawRecord.status)}
              <Link href={`/raw-records/${l.rawRecord.id}`} className="text-indigo-400">
                Inspect
              </Link>
            </li>
          ))}
          {full.entityLinks.length === 0 && (
            <p className="text-sm text-gray-600">No raw record links.</p>
          )}
        </ul>
      </div>

      {store.metadata != null && (
        <div>
          <SectionHeader title="Store metadata (JSON)" />
          <JsonPayloadViewer data={store.metadata} maxCollapsedHeight={220} />
        </div>
      )}
    </div>
  );
}
