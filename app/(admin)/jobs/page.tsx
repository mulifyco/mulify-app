import { JobRepository } from "@/server/repositories/job.repository";
import { SourceRepository } from "@/server/repositories/source.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { timeAgo, formatDuration, formatDate } from "@/lib/date";
import Link from "next/link";
import Pagination from "@/components/ui/Pagination";
import FilterSelect from "@/components/internal/FilterSelect";
import SearchBar from "@/components/ui/SearchBar";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { jobWarningsCount, jobTypeLabel } from "@/lib/admin/jobs-metadata";
import type { JobStatus } from "@/types";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const STATUSES: JobStatus[] = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "PARTIAL"];

function jobRowAccent(status: JobStatus): string {
  switch (status) {
    case "COMPLETED":
      return "border-l-2 border-l-emerald-700/80";
    case "RUNNING":
      return "border-l-2 border-l-indigo-500";
    case "PENDING":
      return "border-l-2 border-l-gray-600";
    case "FAILED":
      return "border-l-2 border-l-red-600";
    case "PARTIAL":
      return "border-l-2 border-l-amber-500";
    default:
      return "";
  }
}

interface Props {
  searchParams: Promise<{ page?: string; sourceId?: string; status?: string; search?: string }>;
}

export default async function JobsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const sourceId = params.sourceId;
  const status = params.status as JobStatus | undefined;
  const search = params.search;

  let result: Awaited<ReturnType<typeof JobRepository.list>>;
  let sources: Awaited<ReturnType<typeof SourceRepository.list>>;

  try {
    [result, sources] = await Promise.all([
      JobRepository.list({
        page,
        pageSize: 25,
        sourceId,
        status: status && STATUSES.includes(status) ? status : undefined,
        search,
      }),
      SourceRepository.list({ pageSize: 100 }),
    ]);
  } catch (e) {
    return (
      <div>
        <PageHeader title="Sync jobs" description="Ingestion runs" />
        <QueryErrorState
          message={
            e instanceof Error
              ? e.message
              : "Could not load jobs. Verify DATABASE_URL and PostgreSQL."
          }
        />
      </div>
    );
  }

  type SourceOption = (typeof sources.data)[number];
  type JobRow = (typeof result.data)[number];

  return (
    <div>
      <PageHeader
        title={`Sync jobs (${result.total.toLocaleString()})`}
        description="Ingestion runs — duration, throughput, warnings, and errors"
      />

      <div className="flex flex-wrap items-center gap-4 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="Job ID or source name…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="status"
            label="Status"
            currentValue={params.status ?? ""}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="sourceId"
            label="Source"
            currentValue={sourceId ?? ""}
            options={sources.data.map((s: SourceOption) => ({
              value: s.id,
              label: s.name,
            }))}
          />
        </Suspense>
        <Link href="/jobs" className="text-xs text-muted hover:opacity-80 ml-auto">
          Clear filters
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[1120px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Job ID
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Source
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Type
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Status
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                Fetched
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                Norm
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                Skip
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                Err
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                Warn
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Duration
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Started
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Completed
              </th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-10 text-center text-muted-2">
                  No jobs match filters.
                </td>
              </tr>
            ) : (
              result.data.map((job: JobRow) => {
                const warn = jobWarningsCount(job.metadata);
                return (
                  <tr key={job.id} className={`hover:bg-surface-2/70 ${jobRowAccent(job.status)}`}>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted max-w-[128px] truncate">
                      <Link href={`/jobs/${job.id}`} className="hover:text-indigo-600">
                        {job.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-foreground">{job.source.name}</div>
                      <div className="text-[11px] text-muted-2">{job.source.type}</div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted max-w-[100px] truncate">
                      {jobTypeLabel(job.metadata, job.triggeredBy)}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(job.status)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{job.totalFetched}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">
                      {job.totalNormalized}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">{job.totalSkipped}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{job.totalFailed}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{warn}</td>
                    <td className="px-3 py-2.5 text-xs text-muted">{formatDuration(job.durationMs)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted">
                      {job.startedAt ? timeAgo(job.startedAt) : timeAgo(job.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">
                      {job.completedAt ? formatDate(job.completedAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/jobs/${job.id}`} className="text-xs text-indigo-600 hover:opacity-80">
                        Detail
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
