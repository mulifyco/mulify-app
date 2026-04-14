import { RawRecordRepository } from "@/server/repositories/raw-record.repository";
import { SourceRepository } from "@/server/repositories/source.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/date";
import Link from "next/link";
import Pagination from "@/components/ui/Pagination";
import { Suspense } from "react";
import SearchBar from "@/components/ui/SearchBar";
import FilterSelect from "@/components/internal/FilterSelect";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { jsonSnippet } from "@/lib/admin/format-payload";
import EmptyState from "@/components/internal/EmptyState";
import RawRecordDrawer from "@/components/internal/RawRecordDrawer";
import {
  parseEntityTypeParam,
  parseRecordStatusParam,
  parseSourceTypeParam,
  parseRecentIngestParam,
  parseLinkedFilterParam,
} from "@/lib/admin/search-params";
import type { EntityType, RecordStatus, SourceType } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    entityType?: string;
    status?: string;
    sourceId?: string;
    sourceType?: string;
    recent?: string;
    linked?: string;
  }>;
}

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: "AD", label: "Ad" },
  { value: "STORE", label: "Store" },
  { value: "PRODUCT", label: "Product" },
  { value: "COLLECTION", label: "Collection" },
  { value: "LANDING_PAGE", label: "Landing page" },
  { value: "ADVERTISER", label: "Advertiser" },
];

const STATUS_OPTIONS: { value: RecordStatus; label: string }[] = [
  { value: "RAW", label: "Raw" },
  { value: "PROCESSING", label: "Processing" },
  { value: "NORMALIZED", label: "Normalized" },
  { value: "FAILED", label: "Failed" },
  { value: "SKIPPED", label: "Skipped" },
];

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "META_ADS", label: "Meta Ads" },
  { value: "SHOPIFY_STOREFRONT", label: "Shopify" },
  { value: "MANUAL", label: "Manual" },
];

const LINKED_OPTIONS = [
  { value: "linked", label: "Has entity links" },
  { value: "unlinked", label: "No links" },
];

const RECENT_OPTIONS = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
];

export default async function RawRecordsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);

  const entityType = parseEntityTypeParam(params.entityType);
  const status = parseRecordStatusParam(params.status);
  const sourceType = parseSourceTypeParam(params.sourceType);
  const linked = parseLinkedFilterParam(params.linked);
  const ingestedAfter = parseRecentIngestParam(params.recent);

  let result: Awaited<ReturnType<typeof RawRecordRepository.list>>;
  let stats: Awaited<ReturnType<typeof RawRecordRepository.getStats>>;
  let sources: Awaited<ReturnType<typeof SourceRepository.list>>;

  try {
    [result, stats, sources] = await Promise.all([
      RawRecordRepository.list({
        page,
        pageSize: 25,
        search: params.search,
        entityType,
        status,
        sourceId: params.sourceId,
        sourceType,
        linked,
        ingestedAfter,
      }),
      RawRecordRepository.getStats(),
      SourceRepository.list({ pageSize: 200 }),
    ]);
  } catch (e) {
    return (
      <div>
        <PageHeader title="Raw records" description="Payload inspection" />
        <QueryErrorState
          message={
            e instanceof Error
              ? e.message
              : "Could not load raw records. Check database connectivity."
          }
        />
      </div>
    );
  }

  type SourceOption = (typeof sources.data)[number];
  type RawRecordRow = (typeof result.data)[number];

  return (
    <div>
      <PageHeader
        title={`Raw records (${result.total.toLocaleString()})`}
        description="Immutable payloads — parse status, job lineage, and normalized entity links"
      />

      <div className="flex flex-wrap items-center gap-3 mb-3 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="External ID or record id…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="entityType"
            label="Entity"
            currentValue={params.entityType ?? ""}
            options={ENTITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="status"
            label="Parse status"
            currentValue={params.status ?? ""}
            options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="sourceType"
            label="Adapter"
            currentValue={params.sourceType ?? ""}
            options={SOURCE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="sourceId"
            label="Source"
            currentValue={params.sourceId ?? ""}
            options={sources.data.map((s: SourceOption) => ({ value: s.id, label: s.name }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="linked"
            label="Links"
            currentValue={params.linked ?? ""}
            options={LINKED_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="recent"
            label="Ingested"
            currentValue={params.recent ?? ""}
            options={RECENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Suspense>
        <Link href="/raw-records" className="text-xs text-muted ml-auto hover:opacity-80">
          Reset
        </Link>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-2 mb-4">
        {stats.byStatus.map((s: (typeof stats.byStatus)[number]) => (
          <span key={String(s.status)}>
            {String(s.status)}: {s._count}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm min-w-[1120px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Record ID
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                External ID
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Entity
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Source
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Job
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Parse
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Links
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Ingested
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase min-w-[200px]">
                Payload preview
              </th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <EmptyState
                    title="No raw records match filters"
                    description="Try broadening your search or clearing filters."
                  />
                </td>
              </tr>
            ) : (
              result.data.map((record: RawRecordRow) => (
                <tr key={record.id} className="hover:bg-surface-2/70">
                  <td className="px-3 py-2.5 font-mono text-[10px] text-muted max-w-[100px] truncate">
                    <Link href={`/raw-records/${record.id}`} className="hover:text-indigo-600">
                      {record.id.slice(0, 12)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground max-w-[140px] truncate">
                    {record.externalId}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] text-muted bg-surface-2 px-2 py-0.5 rounded border border-border">
                      {record.entityType}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">
                    <div>{record.source.name}</div>
                    <div className="text-[10px] text-muted-2 mt-0.5">{record.sourceType}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {record.job ? (
                      <Link href={`/jobs/${record.job.id}`} className="text-indigo-600 hover:opacity-80 font-mono">
                        {record.job.id.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{statusBadge(record.status)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                    {record.entityLinks.length}
                    {record._count.entityLinks > record.entityLinks.length && (
                      <span className="text-muted-2"> / {record._count.entityLinks}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{timeAgo(record.firstSeenAt)}</td>
                  <td className="px-3 py-2.5 text-[11px] font-mono text-muted leading-snug max-w-[280px]">
                    <span className="line-clamp-2 break-all">{jsonSnippet(record.rawPayload, 200)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <RawRecordDrawer
                        title={`${record.entityType} · ${record.externalId}`}
                        payload={record.rawPayload}
                      />
                      <Link href={`/raw-records/${record.id}`} className="text-xs text-muted hover:opacity-80">
                        Detail
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Suspense fallback={null}>
        <Pagination {...result} />
      </Suspense>
    </div>
  );
}
