import { notFound } from "next/navigation";
import Link from "next/link";
import { CollectionRepository } from "@/server/repositories/collection.repository";
import PageHeader from "@/components/ui/PageHeader";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import EntityLinksBlock from "@/components/internal/EntityLinksBlock";
import { formatDate, timeAgo } from "@/lib/date";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import SectionHeader from "@/components/internal/SectionHeader";
import { ProductClusterRepository } from "@/server/repositories/product-cluster.repository";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CollectionDetailPage({ params }: Props) {
  const { id } = await params;
  const col = await CollectionRepository.findById(id);

  if (!col) notFound();

  type CollectionDetail = typeof col;
  type CollectionProductRow = CollectionDetail["products"][number];

  const score = col.confidenceScores[0];
  const winningClusters = await ProductClusterRepository.listForCollection(id, 10);

  return (
    <div>
      <PageHeader
        title={col.title}
        description={`@${col.handle} · ${col.store.domain}`}
        action={
          <div className="flex items-center gap-3">
            <Link
              href={`https://${col.store.domain}/collections/${col.handle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm"
            >
              Storefront ↗
            </Link>
            <Link href="/collections" className="text-sm text-muted hover:opacity-80">
              ← Back
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
            Summary
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {[
              ["Store", col.store.domain],
              ["Products in collection", col._count.products.toLocaleString()],
              ["First seen", timeAgo(col.firstSeenAt)],
              ["Last seen", timeAgo(col.lastSeenAt)],
            ].map(([label, value]) => (
              <div key={String(label)} className="contents">
                <dt className="text-xs text-muted-2">{label}</dt>
                <dd className="text-foreground">{value}</dd>
              </div>
            ))}
            <dt className="text-xs text-muted-2">Store link</dt>
            <dd>
              <Link href={`/stores/${col.store.id}`} className="text-indigo-600 hover:opacity-80 text-sm">
                Open store
              </Link>
            </dd>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-muted uppercase mb-3 tracking-wide">
            Confidence
          </h3>
          <ConfidenceInline score={score ?? null} />
          {score && (
            <div className="mt-4 text-[11px] text-muted-2 space-y-1 tabular-nums">
              <div>Source {(score.sourceScore * 100).toFixed(0)}%</div>
              <div>Completeness {(score.completenessScore * 100).toFixed(0)}%</div>
              <div>Linkage {(score.linkageScore * 100).toFixed(0)}%</div>
              <div className="text-muted pt-1">Updated {formatDate(score.lastScoredAt)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Products (preview)
          </h2>
          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">
                    Title
                  </th>
                  <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(col.products ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-muted-2 text-xs">
                      No product memberships indexed.
                    </td>
                  </tr>
                ) : (
                  (col.products ?? []).map((row: CollectionProductRow) => (
                    <tr key={row.product.id} className="hover:bg-surface-2/70">
                      <td className="px-3 py-2">
                        <div className="text-foreground truncate max-w-md">{row.product.title}</div>
                        <div className="text-[11px] text-muted-2 font-mono">{row.product.handle}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/products/${row.product.id}`} className="text-xs text-indigo-600 hover:opacity-80">
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
            links={(col.entityLinks ?? []).map((l: CollectionDetail["entityLinks"][number]) => ({
              id: l.id,
              entityType: l.entityType,
              entityId: l.entityId,
            }))}
            title="Raw record lineage"
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

      <div className="mt-6">
        <SectionHeader title="Winning product clusters" description="Product-first intelligence (cross-store)" />
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Title</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Win</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Stores</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">LP</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">Raw</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Last seen</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Key</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {winningClusters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-2 text-xs">
                    No clusters yet (run worker: refresh_product_clusters).
                  </td>
                </tr>
              ) : (
                winningClusters.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2">
                      <div className="text-foreground truncate max-w-lg">{c.title ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{c.winningScore}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{c.storeCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{c.landingPageCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{c.linkedRawRecordCount}</td>
                    <td className="px-3 py-2 text-xs text-muted">{timeAgo(c.lastSeenAt)}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-2 font-mono truncate max-w-[240px]">
                      {c.key}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
