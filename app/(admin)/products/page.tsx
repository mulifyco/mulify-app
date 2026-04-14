import Link from "next/link";
import { ProductRepository } from "@/server/repositories/product.repository";
import { StoreRepository } from "@/server/repositories/store.repository";
import PageHeader from "@/components/ui/PageHeader";
import { timeAgo } from "@/lib/date";
import Pagination from "@/components/ui/Pagination";
import SearchBar from "@/components/ui/SearchBar";
import FilterSelect from "@/components/internal/FilterSelect";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import EntityWarningChips from "@/components/internal/EntityWarningChips";
import ProductThumbCell from "@/components/internal/ProductThumbCell";
import { parseBoolParam, parseConfidence } from "@/lib/admin/search-params";
import { productRowWarnings } from "@/lib/admin/entity-warnings";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    storeId?: string;
    isAvailable?: string;
    hasPrice?: string;
    hasCollections?: string;
    dup?: string;
    recent?: string;
    cmin?: string;
    cmax?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const search = params.search;
  const storeId = params.storeId;
  const isAvailable = parseBoolParam(params.isAvailable);
  const hasPrice = parseBoolParam(params.hasPrice);
  const hasCollections = parseBoolParam(params.hasCollections);
  const duplicateHandleOnly = params.dup === "1";
  const confidenceMin = parseConfidence(params.cmin);
  const confidenceMax = parseConfidence(params.cmax);
  const lastSeenAfter =
    params.recent === "7d"
      ? new Date(Date.now() - 7 * 86400000)
      : params.recent === "24h"
        ? new Date(Date.now() - 86400000)
        : undefined;

  const [result, stores] = await Promise.all([
    ProductRepository.list({
      search,
      storeId,
      isAvailable,
      hasPrice,
      hasCollections,
      duplicateHandleOnly: duplicateHandleOnly || undefined,
      confidenceMin,
      confidenceMax,
      lastSeenAfter,
      page,
      pageSize: 25,
    }),
    StoreRepository.list({ pageSize: 200 }),
  ]);

  type StoreOption = (typeof stores.data)[number];
  type ProductRow = (typeof result.data)[number];

  return (
    <div>
      <PageHeader
        title={`Products (${result.total.toLocaleString()})`}
        description="Normalized catalog — pricing, media, collections, duplicate handles"
      />

      <div className="flex flex-wrap items-center gap-3 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="Title, handle, vendor, id…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="storeId"
            label="Store"
            currentValue={storeId ?? ""}
            options={stores.data.map((s: StoreOption) => ({
              value: s.id,
              label: s.domain,
            }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="isAvailable"
            label="Availability"
            currentValue={
              params.isAvailable === "true"
                ? "true"
                : params.isAvailable === "false"
                  ? "false"
                  : ""
            }
            options={[
              { value: "true", label: "Available" },
              { value: "false", label: "Unavailable" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="hasPrice"
            label="Price"
            currentValue={
              params.hasPrice === "true"
                ? "true"
                : params.hasPrice === "false"
                  ? "false"
                  : ""
            }
            options={[
              { value: "true", label: "Has price" },
              { value: "false", label: "No price" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="hasCollections"
            label="Collections"
            currentValue={
              params.hasCollections === "true"
                ? "true"
                : params.hasCollections === "false"
                  ? "false"
                  : ""
            }
            options={[
              { value: "true", label: "In collection" },
              { value: "false", label: "No collection" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="dup"
            label="Duplicates"
            currentValue={params.dup ?? ""}
            options={[{ value: "1", label: "Dup handle (store)" }]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="recent"
            label="Seen"
            currentValue={params.recent ?? ""}
            options={[
              { value: "24h", label: "24h" },
              { value: "7d", label: "7d" },
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
            ]}
          />
        </Suspense>
        <Link href="/products" className="text-xs text-muted ml-auto hover:opacity-80">
          Reset
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[1040px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase w-12">
                Img
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Product
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Store
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Cluster
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Handle
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Price
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Avail.
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Coll.
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Confidence
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                First / last
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
                  No products match filters.
                </td>
              </tr>
            ) : (
              result.data.map((p: ProductRow) => {
                const price =
                  p.priceMin != null || p.priceMax != null
                    ? `${p.priceMin ?? "?"}${
                        p.priceMax != null && p.priceMax !== p.priceMin
                          ? `–${p.priceMax}`
                          : ""
                      }${p.currency ? ` ${p.currency}` : ""}`
                    : "—";
                const warnings = productRowWarnings({
                  priceMin: p.priceMin,
                  priceMax: p.priceMax,
                  featuredImage: p.featuredImage,
                  isAvailable: p.isAvailable,
                  confidenceScores: p.confidenceScores,
                  _count: p._count,
                  duplicateHandle: p.duplicateHandle,
                });
                const cluster = (p as unknown as { clusterMember?: { cluster?: { key: string; storeCount: number; winningScore: number; confidence: number } } })
                  .clusterMember?.cluster;
                return (
                  <tr key={p.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2.5 align-middle">
                      <ProductThumbCell src={p.featuredImage} title={p.title} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-foreground font-medium line-clamp-2 max-w-[200px]">{p.title}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-indigo-600">
                      <Link href={`/stores/${p.store.id}`} className="hover:opacity-80">
                        {p.store.domain}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted">
                      {cluster ? (
                        <div className="space-y-0.5">
                          <div className="text-foreground tabular-nums">
                            win {cluster.winningScore} · stores {cluster.storeCount}
                          </div>
                          <div className="text-muted-2 font-mono truncate max-w-[180px]">{cluster.key}</div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-muted">{p.handle}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground text-xs">
                      {price}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {p.isAvailable === true && (
                        <span className="text-emerald-600">Yes</span>
                      )}
                      {p.isAvailable === false && (
                        <span className="text-amber-600">No</span>
                      )}
                      {p.isAvailable == null && <span className="text-muted-2">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {p._count.collectionMemberships}
                    </td>
                    <td className="px-3 py-2.5">
                      <ConfidenceInline score={p.confidenceScores[0] ?? null} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted leading-snug">
                      <div>{timeAgo(p.firstSeenAt)}</div>
                      <div className="text-muted-2">{timeAgo(p.lastSeenAt)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <EntityWarningChips items={warnings} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/products/${p.id}`} className="text-xs text-indigo-600 hover:opacity-80">
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
