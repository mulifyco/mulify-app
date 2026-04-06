import Link from "next/link";
import { Suspense } from "react";
import { SourceRepository } from "@/server/repositories/source.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import SourceTypeBadge from "@/components/internal/SourceTypeBadge";
import FilterSelect from "@/components/internal/FilterSelect";
import SearchBar from "@/components/ui/SearchBar";
import Pagination from "@/components/ui/Pagination";
import { timeAgo } from "@/lib/date";
import RunSourceButton from "./RunSourceButton";
import CreateSourceButton from "./CreateSourceButton";
import EmptyState from "@/components/internal/EmptyState";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { sourceHealthBadge } from "@/lib/admin/source-health";
import { isSourceConfigEnabled } from "@/lib/admin/source-config";
import { sourceIngestModeLabel } from "@/lib/admin/source-ingest-mode";
import type { SourceStatus, SourceType } from "@/types";

export const dynamic = "force-dynamic";

function configSummary(config: unknown): string {
  if (!config || typeof config !== "object") return "—";
  const c = config as Record<string, unknown>;
  const keys = Object.keys(c).slice(0, 4);
  return keys.map((k) => `${k}: ${typeof c[k] === "object" ? "…" : String(c[k])}`).join(" · ");
}

const TYPE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "META_ADS", label: "Meta Ads" },
  { value: "SHOPIFY_STOREFRONT", label: "Shopify" },
  { value: "MANUAL", label: "Manual" },
];

const STATUS_OPTIONS: { value: SourceStatus; label: string }[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING", label: "Pending" },
  { value: "PAUSED", label: "Paused" },
  { value: "ERROR", label: "Error" },
];

const HEALTH_OPTIONS = [
  { value: "healthy", label: "Healthy" },
  { value: "idle", label: "Idle / pending" },
  { value: "attention", label: "Needs attention" },
  { value: "degraded", label: "Degraded" },
  { value: "paused", label: "Paused" },
];

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    type?: string;
    status?: string;
    health?: string;
  }>;
}

export default async function SourcesPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const search = params.search;
  const type = TYPE_OPTIONS.some((o) => o.value === params.type) ? (params.type as SourceType) : undefined;
  const status = STATUS_OPTIONS.some((o) => o.value === params.status)
    ? (params.status as SourceStatus)
    : undefined;
  const health = params.health;

  let listResult: Awaited<ReturnType<typeof SourceRepository.list>>;
  let globalStats: Awaited<ReturnType<typeof SourceRepository.globalStats>>;

  try {
    [listResult, globalStats] = await Promise.all([
      SourceRepository.list({
        search,
        type,
        status,
        health,
        page,
        pageSize: 25,
      }),
      SourceRepository.globalStats(),
    ]);
  } catch (e) {
    return (
      <div>
        <PageHeader title="Sources" description="Connector configuration and health" action={<CreateSourceButton />} />
        <QueryErrorState
          message={
            e instanceof Error
              ? e.message
              : "Database unreachable or misconfigured. Check DATABASE_URL and that PostgreSQL is running."
          }
        />
      </div>
    );
  }

  const { data: sources, total, ...pagination } = listResult;
  type SourceRow = (typeof sources)[number];

  return (
    <div>
      <PageHeader
        title={`Sources (${total.toLocaleString()} filtered)`}
        description="Configured connectors — health, sync cadence, and ingestion volume"
        action={<CreateSourceButton />}
      />

      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 tabular-nums">
          <span className="text-gray-500">All sources</span>{" "}
          <span className="text-gray-200 font-medium">{globalStats.total}</span>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 tabular-nums">
          <span className="text-gray-500">Active</span>{" "}
          <span className="text-emerald-400/90 font-medium">{globalStats.active}</span>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 tabular-nums">
          <span className="text-gray-500">In error</span>{" "}
          <span className="text-red-400/90 font-medium">{globalStats.inError}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-[#0c0d10]/95 backdrop-blur-sm border-b border-gray-800/80">
        <Suspense fallback={null}>
          <SearchBar placeholder="Search by name…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="type"
            label="Type"
            currentValue={params.type ?? ""}
            options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="status"
            label="Status"
            currentValue={params.status ?? ""}
            options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="health"
            label="Health"
            currentValue={params.health ?? ""}
            options={HEALTH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Suspense>
        <Link href="/sources" className="text-xs text-gray-500 ml-auto hover:text-gray-400">
          Reset filters
        </Link>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          title="No sources match filters"
          description="Adjust filters or add a Meta Ads or Shopify storefront source."
          action={<CreateSourceButton />}
        />
      ) : (
        <>
          <div className="rounded-lg border border-gray-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[1080px]">
              <thead>
                <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Name
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Enabled
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Health
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Mode
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Last sync
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">
                    Jobs
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">
                    Raw rows
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Config
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {sources.map((src: SourceRow) => {
                  const h = sourceHealthBadge(src);
                  const mode = sourceIngestModeLabel(src.type, src.config);
                  const enabled = isSourceConfigEnabled(src.config);
                  return (
                    <tr key={src.id} className="hover:bg-gray-900/40">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/sources/${src.id}`}
                          className="font-medium text-gray-100 hover:text-indigo-300"
                        >
                          {src.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <SourceTypeBadge type={src.type} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">
                        {enabled ? "Yes" : "No"}
                      </td>
                      <td className="px-3 py-2.5">{statusBadge(src.status)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs font-medium ${
                            h.variant === "green"
                              ? "text-emerald-400"
                              : h.variant === "yellow"
                                ? "text-amber-400"
                                : h.variant === "red"
                                  ? "text-red-400"
                                  : "text-gray-500"
                          }`}
                        >
                          {h.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">{mode}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {src.lastSyncAt ? timeAgo(src.lastSyncAt) : "Never"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                        {src._count.ingestionJobs.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                        {src._count.rawRecords.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[200px] truncate font-mono">
                        {configSummary(src.config)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Link
                            href={`/sources/${src.id}`}
                            className="text-xs text-indigo-400 hover:text-indigo-300"
                          >
                            Detail
                          </Link>
                          <Link
                            href={`/jobs?sourceId=${src.id}`}
                            className="text-xs text-gray-500 hover:text-gray-300"
                          >
                            Jobs
                          </Link>
                          <RunSourceButton sourceId={src.id} sourceName={src.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Suspense fallback={null}>
            <Pagination {...pagination} total={total} />
          </Suspense>
        </>
      )}
    </div>
  );
}
