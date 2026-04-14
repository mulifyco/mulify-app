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
import LoadDemoWorkspaceButton from "@/components/launch/LoadDemoWorkspaceButton";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { sourceHealthBadge } from "@/lib/admin/source-health";
import { isSourceConfigEnabled } from "@/lib/admin/source-config";
import { sourceIngestModeLabel } from "@/lib/admin/source-ingest-mode";
import { isDirectIngestSource, sourceCapabilityLabel } from "@/lib/admin/source-capability";
import type { SourceStatus, SourceType } from "@/types";
import Badge from "@/components/ui/Badge";
import SourceReliabilityBadge from "@/components/internal/SourceReliabilityBadge";
import { formatDate } from "@/lib/date";

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
  { value: "SHOPIFY_DOMAIN", label: "Shopify Domain" },
  { value: "MANUAL", label: "Manual" },
  { value: "KEYWORD", label: "Keyword" },
  { value: "META_PAGE", label: "Meta Page" },
  { value: "TIKTOK_PAGE", label: "TikTok Page" },
  { value: "CATEGORY", label: "Category" },
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

  const bareWorkspace =
    globalStats.total === 0 && !search && !type && !status && !health && page <= 1;

  return (
    <div>
      <PageHeader
        title={`Sources (${total.toLocaleString()} filtered)`}
        description="Configured connectors — health, sync cadence, and ingestion volume"
        action={<CreateSourceButton />}
      />

      <div className="flex flex-wrap gap-3 mb-4 text-xs">
        <div className="rounded-lg border border-border bg-card px-3 py-2 tabular-nums shadow-sm">
          <span className="text-muted">All sources</span>{" "}
          <span className="text-foreground font-medium">{globalStats.total}</span>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 tabular-nums shadow-sm">
          <span className="text-muted">Active</span>{" "}
          <span className="text-emerald-600 font-medium">{globalStats.active}</span>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 tabular-nums shadow-sm">
          <span className="text-muted">In error</span>{" "}
          <span className="text-red-600 font-medium">{globalStats.inError}</span>
        </div>
        <Link
          href="/sources/discovery-candidates"
          className="rounded-lg border border-border bg-card px-3 py-2 tabular-nums shadow-sm hover:opacity-80"
        >
          <span className="text-muted">Active candidates</span>{" "}
          <span className="text-foreground font-medium">{globalStats.activeCandidates ?? 0}</span>
        </Link>
        <Link
          href="/sources/discovery-candidates"
          className="rounded-lg border border-border bg-card px-3 py-2 tabular-nums shadow-sm hover:opacity-80"
        >
          <span className="text-muted">High-confidence</span>{" "}
          <span className="text-emerald-600 font-medium">{globalStats.highConfidenceCandidates ?? 0}</span>
          <span className="text-muted-2">{`  (≥ ${globalStats.promoteScoreThreshold ?? 70})`}</span>
        </Link>
        <Link
          href="/sources/discovery-candidates"
          className="rounded-lg border border-border bg-card px-3 py-2 tabular-nums shadow-sm hover:opacity-80"
        >
          <span className="text-muted">Promoted (7d)</span>{" "}
          <span className="text-foreground font-medium">{globalStats.promotedThisWeek ?? 0}</span>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
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
        <Link href="/sources" className="text-xs text-muted ml-auto hover:opacity-80">
          Reset filters
        </Link>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          title={bareWorkspace ? "Connect your first source" : "No sources match filters"}
          description={
            bareWorkspace
              ? "Meta Ads, TikTok, Shopify, and discovery feeds power boards and compare. Add one connector to light up the workspace."
              : "Adjust filters or add a Meta Ads, Shopify, or discovery source from the catalog."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {bareWorkspace ? <LoadDemoWorkspaceButton label="Load sample workspace" /> : null}
              <CreateSourceButton />
            </div>
          }
        />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[1280px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Name
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Type
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Capability
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Enabled
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Health
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Reliability
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Mode
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Last sync
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Last success
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                    Errors
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                    Jobs
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                    Raw rows
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                    Config
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sources.map((src: SourceRow) => {
                  const h = sourceHealthBadge(src);
                  const mode = sourceIngestModeLabel(src.type, src.config);
                  const enabled = isSourceConfigEnabled(src.config);
                  return (
                    <tr key={src.id} className="hover:bg-surface-2/70">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/sources/${src.id}`}
                          className="font-medium text-foreground hover:opacity-80"
                        >
                          {src.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <SourceTypeBadge type={src.type} />
                      </td>
                      <td className="px-3 py-2.5">
                        {isDirectIngestSource(src.type) ? (
                          <Badge label={sourceCapabilityLabel(src.type)} variant="green" />
                        ) : (
                          <div className="flex flex-col gap-1">
                            <Badge label={sourceCapabilityLabel(src.type)} variant="yellow" />
                            <span className="text-[10px] text-muted-2">Discovery phase ile işlenir</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {enabled ? "Yes" : "No"}
                      </td>
                      <td className="px-3 py-2.5">{statusBadge(src.status)}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs font-medium ${
                            h.variant === "green"
                              ? "text-emerald-600"
                              : h.variant === "yellow"
                                ? "text-amber-600"
                                : h.variant === "red"
                                  ? "text-red-600"
                                  : "text-muted"
                          }`}
                        >
                          {h.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1">
                          <SourceReliabilityBadge status={src.reliabilityStatus} />
                          <span className="text-[10px] text-muted-2 tabular-nums">
                            fail {src.consecutiveFailures} · empty {src.consecutiveEmptyRuns}
                          </span>
                          {src.cooldownUntil && new Date(src.cooldownUntil).getTime() > Date.now() ? (
                            <span className="text-[10px] text-amber-700" title="Worker skips until this time (manual run still allowed if not disabled).">
                              cooldown {formatDate(src.cooldownUntil)}
                            </span>
                          ) : null}
                          {src.disabledReason ? (
                            <span className="text-[10px] text-red-700 max-w-[200px] truncate" title={src.disabledReason}>
                              {src.disabledReason}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">{mode}</td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {src.lastSyncAt ? timeAgo(src.lastSyncAt) : "Never"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {src.lastSuccessAt ? timeAgo(src.lastSuccessAt) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {src.errorCount?.toLocaleString?.() ?? String(src.errorCount ?? 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {src._count.ingestionJobs.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {src._count.rawRecords.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-2 max-w-[200px] truncate font-mono">
                        {configSummary(src.config)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Link
                            href={`/sources/${src.id}`}
                            className="text-xs text-indigo-600 hover:opacity-80"
                          >
                            Detail
                          </Link>
                          <Link
                            href={`/jobs?sourceId=${src.id}`}
                            className="text-xs text-muted hover:opacity-80"
                          >
                            Jobs
                          </Link>
                          <RunSourceButton
                            sourceId={src.id}
                            sourceName={src.name}
                            disabled={!isDirectIngestSource(src.type)}
                            disabledReason={
                              !isDirectIngestSource(src.type)
                                ? "Discovery-only source. Discovery phase ile işlenir."
                                : undefined
                            }
                          />
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
