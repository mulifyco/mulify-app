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
        <Link href="/jobs" className="text-sm text-indigo-400 mt-4 inline-block">
          ← Back to jobs
        </Link>
      </div>
    );
  }

  type JobDetail = typeof job;
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
              className="text-xs px-3 py-1.5 rounded border border-gray-700 text-gray-500 cursor-not-allowed"
            >
              Rerun (soon)
            </button>
            <Link href="/jobs" className="text-sm text-gray-400 hover:text-gray-200">
              ← Back to jobs
            </Link>
          </div>
        }
      />

      <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4 mb-6">
        <div className="text-[11px] font-semibold text-gray-500 uppercase mb-3">Execution timeline</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-600">Created</div>
            <div className="text-gray-300">{formatDate(job.createdAt)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600">Started</div>
            <div className="text-gray-300">{job.startedAt ? formatDate(job.startedAt) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600">Completed</div>
            <div className="text-gray-300">{job.completedAt ? formatDate(job.completedAt) : "—"}</div>
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
          <div key={item.label} className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
            <div className="text-[11px] text-gray-500 uppercase mb-1">{item.label}</div>
            <div className="text-sm text-white font-medium tabular-nums break-all">{item.value}</div>
          </div>
        ))}
      </div>

      {job.error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
          <div className="text-xs text-red-400 uppercase mb-2 font-semibold">Fatal / job error</div>
          <div className="text-sm text-red-300 whitespace-pre-wrap">{job.error}</div>
          {job.errorStack && (
            <pre className="mt-3 text-xs text-red-500/70 overflow-auto max-h-48 border-t border-red-900/40 pt-3">
              {job.errorStack}
            </pre>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 p-4 mb-6">
          <div className="text-xs font-semibold text-amber-400 uppercase mb-2">
            Warnings ({warnings.length})
          </div>
          <ul className="text-xs text-amber-100/80 space-y-1.5 list-decimal list-inside max-h-56 overflow-y-auto">
            {warnings.map((w, i) => (
              <li key={`${i}-${w.slice(0, 40)}`}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {job.metadata != null && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Job metadata (JSON)
          </h2>
          <JsonPayloadViewer data={job.metadata} maxCollapsedHeight={240} />
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Related raw records ({job.rawRecords.length} shown)
          </h2>
          <Link
            href={`/raw-records?search=${encodeURIComponent(job.id)}`}
            className="text-xs text-indigo-400"
          >
            Filter list →
          </Link>
        </div>
        <div className="rounded-lg border border-gray-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">External ID</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Entity</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Parse</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Ingested</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {job.rawRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-600 text-xs">
                    No raw rows linked to this job id.
                  </td>
                </tr>
              ) : (
                job.rawRecords.map((r: JobDetail["rawRecords"][number]) => (
                  <tr key={r.id} className="hover:bg-gray-900/40">
                    <td className="px-3 py-2 font-mono text-xs text-gray-400 truncate max-w-[200px]">
                      {r.externalId}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{r.entityType}</td>
                    <td className="px-3 py-2">{statusBadge(r.status)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(r.firstSeenAt)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/raw-records/${r.id}`} className="text-xs text-indigo-400">
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
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Sync logs ({job.syncLogs.length} recent)
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            {job.syncLogs.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-600 text-sm">No logs</div>
            ) : (
              job.syncLogs.map((log) => (
                <div
                  key={log.id}
                  className={`px-4 py-2 border-b border-gray-800/50 text-xs font-mono flex gap-3 ${
                    log.level === "error"
                      ? "text-red-400"
                      : log.level === "warn"
                        ? "text-yellow-400"
                        : "text-gray-400"
                  }`}
                >
                  <span className="text-gray-700 flex-none">
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
