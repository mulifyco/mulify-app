import { notFound } from "next/navigation";
import Link from "next/link";
import { CollectionRepository } from "@/server/repositories/collection.repository";
import PageHeader from "@/components/ui/PageHeader";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import EntityLinksBlock from "@/components/internal/EntityLinksBlock";
import { formatDate, timeAgo } from "@/lib/date";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";

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
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
            >
              Storefront ↗
            </Link>
            <Link href="/collections" className="text-sm text-gray-400 hover:text-gray-200">
              ← Back
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">
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
                <dt className="text-xs text-gray-600">{label}</dt>
                <dd className="text-gray-300">{value}</dd>
              </div>
            ))}
            <dt className="text-xs text-gray-600">Store link</dt>
            <dd>
              <Link href={`/stores/${col.store.id}`} className="text-indigo-400 text-sm">
                Open store
              </Link>
            </dd>
          </dl>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wide">
            Confidence
          </h3>
          <ConfidenceInline score={score ?? null} />
          {score && (
            <div className="mt-4 text-[11px] text-gray-600 space-y-1 tabular-nums">
              <div>Source {(score.sourceScore * 100).toFixed(0)}%</div>
              <div>Completeness {(score.completenessScore * 100).toFixed(0)}%</div>
              <div>Linkage {(score.linkageScore * 100).toFixed(0)}%</div>
              <div className="text-gray-500 pt-1">Updated {formatDate(score.lastScoredAt)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Products (preview)
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
                {col.products.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-gray-600 text-xs">
                      No product memberships indexed.
                    </td>
                  </tr>
                ) : (
                  col.products.map((row: CollectionProductRow) => (
                    <tr key={row.product.id} className="hover:bg-gray-900/40">
                      <td className="px-3 py-2">
                        <div className="text-gray-200 truncate max-w-md">{row.product.title}</div>
                        <div className="text-[11px] text-gray-600 font-mono">{row.product.handle}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/products/${row.product.id}`} className="text-xs text-indigo-400">
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
            links={col.entityLinks.map((l: CollectionDetail["entityLinks"][number]) => ({
              id: l.id,
              entityType: l.entityType,
              entityId: l.entityId,
            }))}
            title="Raw record lineage"
          />
          {score?.breakdown != null && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 tracking-wide">
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
