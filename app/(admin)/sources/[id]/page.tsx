import { notFound } from "next/navigation";
import Link from "next/link";
import { SourceRepository } from "@/server/repositories/source.repository";
import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import SourceTypeBadge from "@/components/internal/SourceTypeBadge";
import SectionHeader from "@/components/internal/SectionHeader";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import { formatDate, timeAgo } from "@/lib/date";
import RunSourceButton from "../RunSourceButton";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { redactSourceConfigForDisplay } from "@/lib/admin/source-config";
import { sourceHealthBadge } from "@/lib/admin/source-health";
import { sourceIngestModeLabel } from "@/lib/admin/source-ingest-mode";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SourceDetailPage({ params }: Props) {
  const { id } = await params;

  let src: Awaited<ReturnType<typeof SourceRepository.findById>>;
  let recentJobs: Awaited<ReturnType<typeof SourceRepository.getRecentJobs>>;
  let digest: Awaited<ReturnType<typeof SourceRepository.getOperationalDigest>>;

  try {
    const s = await SourceRepository.findById(id);
    if (!s) notFound();
    src = s;
    [recentJobs, digest] = await Promise.all([
      SourceRepository.getRecentJobs(id, 15),
      SourceRepository.getOperationalDigest(id),
    ]);
  } catch (e) {
    return (
      <div>
        <PageHeader title="Source" description={id} />
        <QueryErrorState
          message={e instanceof Error ? e.message : "Failed to load source. Check database connectivity."}
        />
        <Link href="/sources" className="text-sm text-indigo-400 mt-4 inline-block">
          ← All sources
        </Link>
      </div>
    );
  }

  const health = sourceHealthBadge(src);
  const mode = sourceIngestModeLabel(src.type, src.config);

  return (
    <div className="space-y-8">
      <PageHeader
        title={src.name}
        description={`Source ID · ${src.id}`}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <RunSourceButton sourceId={src.id} sourceName={src.name} />
            <Link href={`/jobs?sourceId=${src.id}`} className="text-xs text-gray-500 hover:text-gray-300">
              All jobs
            </Link>
            <Link href="/sources" className="text-sm text-gray-500 hover:text-gray-300">
              ← All sources
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
          <div className="text-[11px] text-gray-500 uppercase">Type</div>
          <div className="mt-1">
            <SourceTypeBadge type={src.type} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
          <div className="text-[11px] text-gray-500 uppercase">Status</div>
          <div className="mt-1">{statusBadge(src.status)}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
          <div className="text-[11px] text-gray-500 uppercase">Health</div>
          <div
            className={`mt-1 text-sm font-medium ${
              health.variant === "green"
                ? "text-emerald-400"
                : health.variant === "yellow"
                  ? "text-amber-400"
                  : health.variant === "red"
                    ? "text-red-400"
                    : "text-gray-500"
            }`}
          >
            {health.label}
          </div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
          <div className="text-[11px] text-gray-500 uppercase">Ingest mode</div>
          <div className="mt-1 text-gray-200">{mode}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
          <div className="text-[11px] text-gray-500 uppercase">Last sync</div>
          <div className="mt-1 text-gray-200">{src.lastSyncAt ? timeAgo(src.lastSyncAt) : "Never"}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2">
          <div className="text-[11px] text-gray-500 uppercase">Totals</div>
          <div className="mt-1 text-xs text-gray-400 tabular-nums">
            {src._count.ingestionJobs} jobs · {src._count.rawRecords.toLocaleString()} raw
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
          <div className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Last successful job</div>
          {digest.lastSuccess ? (
            <div className="text-sm text-gray-300 space-y-1">
              <div className="font-mono text-xs text-indigo-400">
                <Link href={`/jobs/${digest.lastSuccess.id}`}>{digest.lastSuccess.id}</Link>
              </div>
              <div className="text-xs text-gray-500">
                {digest.lastSuccess.completedAt
                  ? formatDate(digest.lastSuccess.completedAt)
                  : digest.lastSuccess.startedAt
                    ? formatDate(digest.lastSuccess.startedAt)
                    : "—"}
              </div>
              <div className="text-xs text-gray-600 tabular-nums">
                fetched {digest.lastSuccess.totalFetched} · normalized {digest.lastSuccess.totalNormalized}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">No completed job yet.</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4">
          <div className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Last failed job</div>
          {digest.lastFailed ? (
            <div className="text-sm text-gray-300 space-y-1">
              <div className="font-mono text-xs text-red-400/90">
                <Link href={`/jobs/${digest.lastFailed.id}`}>{digest.lastFailed.id}</Link>
              </div>
              <div className="text-xs text-gray-500">
                {digest.lastFailed.completedAt
                  ? formatDate(digest.lastFailed.completedAt)
                  : formatDate(digest.lastFailed.createdAt)}
              </div>
              {digest.lastFailed.error && (
                <p className="text-xs text-red-300/90 line-clamp-3">{digest.lastFailed.error}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No failed jobs recorded.</p>
          )}
        </div>
      </div>

      {(src.lastError || src.errorCount > 0) && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm">
          <div className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-1">
            Source error · count {src.errorCount}
          </div>
          <p className="text-red-200/90 text-sm">{src.lastError ?? "—"}</p>
        </div>
      )}

      {digest.recentWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 px-4 py-3">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">
            Recent job warnings (de-duplicated)
          </div>
          <ul className="text-xs text-amber-200/80 space-y-1 list-disc list-inside max-h-40 overflow-y-auto">
            {digest.recentWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionHeader title="Configuration (secrets redacted)" />
        <p className="text-[11px] text-gray-600 mb-2">
          Full JSON with token-like keys masked. Raw secrets are never shown here.
        </p>
        <JsonPayloadViewer data={redactSourceConfigForDisplay(src.config)} maxCollapsedHeight={280} />
      </div>

      <div>
        <SectionHeader title="Recent jobs" description="Newest first — throughput and failures" />
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Trigger</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase text-right">
                  Fetched
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase text-right">
                  Norm
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase text-right">
                  Fail
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold text-gray-500 uppercase">Started</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {recentJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-600 text-sm">
                    No jobs for this source yet.
                  </td>
                </tr>
              ) : (
                recentJobs.map((j) => (
                  <tr key={j.id} className="hover:bg-gray-900/40">
                    <td className="px-3 py-2">{statusBadge(j.status)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{j.triggeredBy}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">{j.totalFetched}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-400/80">
                      {j.totalNormalized}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-400/70">{j.totalFailed}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {j.startedAt ? formatDate(j.startedAt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/jobs/${j.id}`} className="text-xs text-indigo-400">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-2">
          <Link href={`/jobs?sourceId=${src.id}`} className="text-xs text-indigo-400 hover:text-indigo-300">
            View all jobs for this source →
          </Link>
        </div>
      </div>
    </div>
  );
}
