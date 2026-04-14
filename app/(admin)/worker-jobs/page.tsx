import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { timeAgo, formatDuration } from "@/lib/date";
import Pagination from "@/components/ui/Pagination";
import FilterSelect from "@/components/internal/FilterSelect";
import { ScraperJobRepository } from "@/server/repositories/scraper-job.repository";
import EmptyState from "@/components/internal/EmptyState";
import Link from "next/link";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string; type?: string; status?: string }>;
}

const STATUS_OPTIONS = [
  { value: "RUNNING", label: "RUNNING" },
  { value: "SUCCESS", label: "SUCCESS" },
  { value: "FAILED", label: "FAILED" },
];

function durMs(startedAt: Date | null, finishedAt: Date | null): number | null {
  if (!startedAt || !finishedAt) return null;
  return finishedAt.getTime() - startedAt.getTime();
}

export default async function WorkerJobsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const type = sp.type?.trim() || undefined;
  const status = sp.status?.trim() || undefined;

  const result = await ScraperJobRepository.list({ page, pageSize: 25, type, status });

  type Row = (typeof result.data)[number];

  const uniqueTypes = [...new Set(result.data.map((r) => r.type))].slice(0, 30);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Worker jobs (${result.total.toLocaleString()})`}
        description="Local worker loop runs — refresh_ads, refresh_shops, recalculate_scores"
        action={
          <Link href="/worker-jobs" className="text-sm text-muted hover:opacity-80">
            Reset
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-2 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <FilterSelect
            param="status"
            label="Status"
            currentValue={sp.status ?? ""}
            options={STATUS_OPTIONS}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="type"
            label="Type"
            currentValue={sp.type ?? ""}
            options={uniqueTypes.map((t) => ({ value: t, label: t }))}
          />
        </Suspense>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Type</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Status</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Started</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Duration</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Error</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState title="No worker jobs yet" description="Run `npm run worker` to start the loop." />
                </td>
              </tr>
            ) : (
              result.data.map((j: Row) => {
                const d = durMs(j.startedAt, j.finishedAt);
                return (
                  <tr key={j.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2.5 font-mono text-xs text-foreground">{j.type}</td>
                    <td className="px-3 py-2.5">{statusBadge(j.status)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted">
                      {j.startedAt ? timeAgo(j.startedAt) : timeAgo(j.createdAt)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">{d != null ? formatDuration(d) : "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted max-w-[420px] truncate">
                      {j.error ? j.error : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] text-muted-2 font-mono">{j.id.slice(0, 10)}…</span>
                    </td>
                  </tr>
                );
              })
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

