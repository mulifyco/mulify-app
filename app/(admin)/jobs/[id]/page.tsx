import { notFound } from "next/navigation";
import { JobRepository } from "@/server/repositories/job.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { formatDate, formatDuration } from "@/lib/date";
import Link from "next/link";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import QueryErrorState from "@/components/internal/QueryErrorState";
import {
  jobBatchCount,
  jobTypeLabel,
  jobWarningsList,
} from "@/lib/admin/jobs-metadata";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;

  let job: Awaited<ReturnType<typeof JobRepository.findById>>;

  try {
    const j = await JobRepository.findById(id);
    if (!j) notFound();
    job = j;
  } catch (e) {
    return (
      <div>
        <PageHeader title="Job" description={id} />
        <QueryErrorState message={e instanceof Error ? e.message : "Failed to load job."} />
        <Link href="/jobs" className="text-sm text-indigo-600 hover:opacity-80 mt-4 inline-block">
          ← Back to jobs
        </Link>
      </div>
    );
  }

  type JobDetail = typeof job;
  type SyncLogRow = NonNullable<JobDetail["syncLogs"]>[number];
  const warnings = jobWarningsList(job.metadata);
  const batches = jobBatchCount(job.metadata);

  return (
    <div>
      <PageHeader
        title={`Job ${job.id.slice(0, 10)}…`}
        description={`${job.source.name} · ${jobTypeLabel(job.metadata, job.triggeredBy)}`}
        action={
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              disabled
              title="Retry / rerun will be wired to the job runner in a later iteration"
              className="text-xs px-3 py-1.5 rounded border border-border text-muted-2 cursor-not-allowed"
            >
              Rerun (soon)
            </button>
            <Link href="/jobs" className="text-sm text-muted hover:opacity-80">
              ← Back to jobs
            </Link>
          </div>
        }
      />

      <div className="rounded-lg border border-border bg-card p-4 mb-6 shadow-sm">
        <div className="text-[11px] font-semibold text-muted uppercase mb-3">Execution timeline</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-2">Created</div>
            <div className="text-foreground">{formatDate(job.createdAt)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-2">Started</div>
            <div className="text-foreground">{job.startedAt ? formatDate(job.startedAt) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-2">Completed</div>
            <div className="text-foreground">{job.completedAt ? formatDate(job.completedAt) : "—"}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Status", value: statusBadge(job.status) },
          { label: "Duration", value: formatDuration(job.durationMs) },
          { label: "Raw rows (job)", value: job._count.rawRecords },
          { label: "Cursor", value: job.cursor ? `${job.cursor.slice(0, 48)}…` : "—" },
          { label: "Fetched", value: job.totalFetched },
          { label: "Stored", value: job.totalStored },
          { label: "Normalized", value: job.totalNormalized },
          { label: "Skipped", value: job.totalSkipped },
          { label: "Failed (records)", value: job.totalFailed },
          { label: "Batches (metadata)", value: batches ?? "—" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="text-[11px] text-muted uppercase mb-1">{item.label}</div>
            <div className="text-sm text-foreground font-medium tabular-nums break-all">{item.value}</div>
          </div>
        ))}
      </div>

      {job.error && (
        <div className="rounded-lg p-4 mb-6 border border-[color:var(--badge-red-border)] bg-[color:var(--badge-red-bg)] text-[color:var(--badge-red-fg)] shadow-sm">
          <div className="text-xs uppercase mb-2 font-semibold">Fatal / job error</div>
          <div className="text-sm whitespace-pre-wrap">{job.error}</div>
          {job.errorStack && (
            <pre className="mt-3 text-xs overflow-auto max-h-48 border-t border-[color:var(--badge-red-border)]/60 pt-3">
              {job.errorStack}
            </pre>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-[color:var(--badge-yellow-border)] bg-[color:var(--badge-yellow-bg)] p-4 mb-6 shadow-sm">
          <div className="text-xs font-semibold text-[color:var(--badge-yellow-fg)] uppercase mb-2">
            Warnings ({warnings.length})
          </div>
          <ul className="text-xs text-[color:var(--badge-yellow-fg)]/90 space-y-1.5 list-decimal list-inside max-h-56 overflow-y-auto">
            {warnings.map((w, i) => (
              <li key={`${i}-${w.slice(0, 40)}`}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {job.metadata != null && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Job metadata (JSON)
          </h2>
          <JsonPayloadViewer data={job.metadata} maxCollapsedHeight={240} />
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Related raw records ({(job.rawRecords ?? []).length} shown)
          </h2>
          <Link
            href={`/raw-records?search=${encodeURIComponent(job.id)}`}
            className="text-xs text-indigo-600 hover:opacity-80"
          >
            Filter list →
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">External ID</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Entity</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Parse</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Ingested</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(job.rawRecords ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-2 text-xs">
                    No raw rows linked to this job id.
                  </td>
                </tr>
              ) : (
                (job.rawRecords ?? []).map((r: JobDetail["rawRecords"][number]) => (
                  <tr key={r.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2 font-mono text-xs text-muted truncate max-w-[200px]">
                      {r.externalId}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{r.entityType}</td>
                    <td className="px-3 py-2">{statusBadge(r.status)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{formatDate(r.firstSeenAt)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/raw-records/${r.id}`} className="text-xs text-indigo-600 hover:opacity-80">
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

      <div>
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
          Sync logs ({(job.syncLogs ?? []).length} recent)
        </h2>
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
          <div className="max-h-96 overflow-y-auto">
            {(job.syncLogs ?? []).length === 0 ? (
              <div className="px-4 py-6 text-center text-muted-2 text-sm">No logs</div>
            ) : (
              (job.syncLogs ?? []).map((log: SyncLogRow) => (
                <div
                  key={log.id}
                  className={`px-4 py-2 border-b border-border text-xs font-mono flex gap-3 ${
                    log.level === "error"
                      ? "text-red-600"
                      : log.level === "warn"
                        ? "text-amber-600"
                        : "text-muted"
                  }`}
                >
                  <span className="text-muted-2 flex-none">
                    {new Date(log.createdAt).toISOString().slice(11, 23)}
                  </span>
                  <span className="flex-none uppercase text-xs w-10">[{log.level}]</span>
                  <span className="min-w-0 break-words">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
