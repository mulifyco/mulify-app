import Link from "next/link";
import { CollectionRepository } from "@/server/repositories/collection.repository";
import { StoreRepository } from "@/server/repositories/store.repository";
import PageHeader from "@/components/ui/PageHeader";
import { timeAgo } from "@/lib/date";
import Pagination from "@/components/ui/Pagination";
import SearchBar from "@/components/ui/SearchBar";
import FilterSelect from "@/components/internal/FilterSelect";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import { parseConfidence } from "@/lib/admin/search-params";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    storeId?: string;
    cmax?: string;
  }>;
}

export default async function CollectionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const search = params.search;
  const storeId = params.storeId;
  const confidenceMax = parseConfidence(params.cmax);

  const [result, storesList] = await Promise.all([
    CollectionRepository.list({
      search,
      storeId,
      confidenceMax,
      page,
      pageSize: 25,
    }),
    StoreRepository.list({ pageSize: 200 }),
  ]);

  type StoreOption = (typeof storesList.data)[number];
  type CollectionRow = (typeof result.data)[number];

  return (
    <div>
      <PageHeader
        title={`Collections (${result.total.toLocaleString()})`}
        description="Shopify collection intelligence — membership scale and confidence"
      />

      <div className="flex flex-wrap items-center gap-4 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="Title or handle…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="storeId"
            label="Store"
            currentValue={storeId ?? ""}
            options={storesList.data.map((s: StoreOption) => ({ value: s.id, label: s.domain }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="cmax"
            label="Max score"
            currentValue={params.cmax ?? ""}
            options={[
              { value: "0.45", label: "≤ 0.45" },
              { value: "0.55", label: "≤ 0.55" },
            ]}
          />
        </Suspense>
        <Link href="/collections" className="text-xs text-muted ml-auto hover:opacity-80">
          Reset
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Title
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Handle
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Store
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Products
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Confidence
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                First seen
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Last seen
              </th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted-2">
                  No collections match filters.
                </td>
              </tr>
            ) : (
              result.data.map((col: CollectionRow) => (
                <tr key={col.id} className="hover:bg-surface-2/70">
                  <td className="px-3 py-2.5 text-foreground font-medium max-w-[220px] truncate">
                    {col.title}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted">{col.handle}</td>
                  <td className="px-3 py-2.5 text-xs">
                    <Link
                      href={`/stores/${col.store.id}`}
                      className="text-indigo-600 hover:opacity-80"
                    >
                      {col.store.domain}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {col._count.products.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <ConfidenceInline score={col.confidenceScores[0] ?? null} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{timeAgo(col.firstSeenAt)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted">{timeAgo(col.lastSeenAt)}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/collections/${col.id}`} className="text-xs text-indigo-600 hover:opacity-80">
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination {...result} />
    </div>
  );
}
