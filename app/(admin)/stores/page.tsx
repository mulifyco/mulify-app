import Link from "next/link";
import { StoreRepository } from "@/server/repositories/store.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/date";
import Pagination from "@/components/ui/Pagination";
import SearchBar from "@/components/ui/SearchBar";
import FilterSelect from "@/components/internal/FilterSelect";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import EntityWarningChips from "@/components/internal/EntityWarningChips";
import { parseBoolParam, parseConfidence } from "@/lib/admin/search-params";
import { storeRowWarnings } from "@/lib/admin/entity-warnings";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    hasProducts?: string;
    recent?: string;
    cmin?: string;
    cmax?: string;
    stale?: string;
    minProd?: string;
  }>;
}

export default async function StoresPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const search = params.search;
  const hasProducts = parseBoolParam(params.hasProducts);
  const confidenceMin = parseConfidence(params.cmin);
  const confidenceMax = parseConfidence(params.cmax);
  const recent = params.recent;
  const updatedAfter =
    recent === "7d"
      ? new Date(Date.now() - 7 * 86400000)
      : recent === "24h"
        ? new Date(Date.now() - 86400000)
        : undefined;

  const staleDays = params.stale === "30" ? 30 : params.stale === "90" ? 90 : undefined;
  const minProducts =
    params.minProd === "10" ? 10 : params.minProd === "50" ? 50 : params.minProd === "100" ? 100 : undefined;

  const result = await StoreRepository.list({
    search,
    hasProducts,
    confidenceMin,
    confidenceMax,
    updatedAfter,
    staleDays,
    minProducts,
    page,
    pageSize: 25,
  });

  type StoreRow = (typeof result.data)[number];

  return (
    <div>
      <PageHeader
        title={`Stores (${result.total.toLocaleString()})`}
        description="Shopify storefront intelligence — catalog scale, LP graph links, crawl freshness"
      />

      <div className="flex flex-wrap items-center gap-3 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="Domain or store name…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="hasProducts"
            label="Catalog"
            currentValue={
              params.hasProducts === "true"
                ? "true"
                : params.hasProducts === "false"
                  ? "false"
                  : ""
            }
            options={[
              { value: "true", label: "Has products" },
              { value: "false", label: "No products" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="recent"
            label="Updated"
            currentValue={params.recent ?? ""}
            options={[
              { value: "24h", label: "Last 24h" },
              { value: "7d", label: "Last 7d" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="stale"
            label="Stale"
            currentValue={params.stale ?? ""}
            options={[
              { value: "30", label: "No seen 30d+" },
              { value: "90", label: "No seen 90d+" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="minProd"
            label="Min products"
            currentValue={params.minProd ?? ""}
            options={[
              { value: "10", label: "≥ 10 products" },
              { value: "50", label: "≥ 50 products" },
              { value: "100", label: "≥ 100 products" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="cmin"
            label="Min score"
            currentValue={params.cmin ?? ""}
            options={[
              { value: "0.45", label: "≥ 0.45" },
              { value: "0.6", label: "≥ 0.60" },
            ]}
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
              { value: "0.7", label: "≤ 0.70" },
            ]}
          />
        </Suspense>
        <Link href="/stores" className="text-xs text-muted hover:opacity-80 ml-auto">
          Reset
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[1120px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Domain
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Platform
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Status
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Products
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Collections
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                LP links
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Confidence
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Last crawl
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Seen
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Flags
              </th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-muted-2">
                  No stores match filters.
                </td>
              </tr>
            ) : (
              result.data.map((store: StoreRow) => {
                const warnings = storeRowWarnings({
                  _count: store._count,
                  confidenceScores: store.confidenceScores,
                  lastSeenAt: store.lastSeenAt,
                  lastCrawledAt: store.lastCrawledAt,
                  landingPageLinkCount: store.landingPageLinkCount,
                });
                return (
                  <tr key={store.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">{store.domain}</div>
                      {store.name && (
                        <div className="text-xs text-muted truncate max-w-[220px]">{store.name}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">{store.platform}</td>
                    <td className="px-3 py-2.5">{statusBadge(store.isActive ? "ACTIVE" : "PAUSED")}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {store._count.products.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {store._count.collections.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {store.landingPageLinkCount}
                    </td>
                    <td className="px-3 py-2.5">
                      <ConfidenceInline score={store.confidenceScores[0] ?? null} />
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">
                      {store.lastCrawledAt ? timeAgo(store.lastCrawledAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted leading-snug">
                      <div>{timeAgo(store.firstSeenAt)}</div>
                      <div className="text-muted-2">{timeAgo(store.lastSeenAt)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <EntityWarningChips items={warnings} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/stores/${store.id}`} className="text-xs text-indigo-600 hover:opacity-80">
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

      <Pagination {...result} />
    </div>
  );
}
