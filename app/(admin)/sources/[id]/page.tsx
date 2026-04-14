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
import SourceReliabilityBadge from "@/components/internal/SourceReliabilityBadge";
import ResetReliabilityButton from "../ResetReliabilityButton";

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
        <Link href="/sources" className="text-sm text-indigo-600 hover:opacity-80 mt-4 inline-block">
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
            <Link href={`/jobs?sourceId=${src.id}`} className="text-xs text-muted hover:opacity-80">
              All jobs
            </Link>
            <Link href="/sources" className="text-sm text-muted hover:opacity-80">
              ← All sources
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <div className="text-[11px] text-muted uppercase">Type</div>
          <div className="mt-1">
            <SourceTypeBadge type={src.type} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <div className="text-[11px] text-muted uppercase">Status</div>
          <div className="mt-1">{statusBadge(src.status)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <div className="text-[11px] text-muted uppercase">Health</div>
          <div
            className={`mt-1 text-sm font-medium ${
              health.variant === "green"
                ? "text-emerald-600"
                : health.variant === "yellow"
                  ? "text-amber-600"
                  : health.variant === "red"
                    ? "text-red-600"
                    : "text-muted"
            }`}
          >
            {health.label}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <div className="text-[11px] text-muted uppercase">Ingest mode</div>
          <div className="mt-1 text-foreground">{mode}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <div className="text-[11px] text-muted uppercase">Last sync</div>
          <div className="mt-1 text-foreground">{src.lastSyncAt ? timeAgo(src.lastSyncAt) : "Never"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <div className="text-[11px] text-muted uppercase">Totals</div>
          <div className="mt-1 text-xs text-muted tabular-nums">
            {src._count.ingestionJobs} jobs · {src._count.rawRecords.toLocaleString()} raw
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
          <div className="text-[11px] text-muted uppercase">Reliability</div>
          <div className="mt-1">
            <SourceReliabilityBadge status={src.reliabilityStatus} />
          </div>
          <div className="mt-1 text-[11px] text-muted tabular-nums">
            fails {src.consecutiveFailures} · empty {src.consecutiveEmptyRuns}
          </div>
          {src.lastHealthyAt ? (
            <div className="text-[10px] text-muted-2 mt-0.5">healthy {formatDate(src.lastHealthyAt)}</div>
          ) : null}
          {src.cooldownUntil && src.cooldownUntil.getTime() > Date.now() ? (
            <div className="text-[10px] text-amber-700 mt-0.5">cooldown {formatDate(src.cooldownUntil)}</div>
          ) : null}
          {src.disabledReason ? (
            <div className="text-[10px] text-red-700 mt-0.5 break-words">{src.disabledReason}</div>
          ) : null}
          {src.reliabilityStatus !== "HEALTHY" ? (
            <div className="mt-2">
              <ResetReliabilityButton sourceId={src.id} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-muted uppercase mb-2">Last successful job</div>
          {digest.lastSuccess ? (
            <div className="text-sm text-foreground space-y-1">
              <div className="font-mono text-xs text-indigo-600">
                <Link href={`/jobs/${digest.lastSuccess.id}`}>{digest.lastSuccess.id}</Link>
              </div>
              <div className="text-xs text-muted">
                {digest.lastSuccess.completedAt
                  ? formatDate(digest.lastSuccess.completedAt)
                  : digest.lastSuccess.startedAt
                    ? formatDate(digest.lastSuccess.startedAt)
                    : "—"}
              </div>
              <div className="text-xs text-muted-2 tabular-nums">
                fetched {digest.lastSuccess.totalFetched} · normalized {digest.lastSuccess.totalNormalized}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-2">No completed job yet.</p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-muted uppercase mb-2">Last failed job</div>
          {digest.lastFailed ? (
            <div className="text-sm text-foreground space-y-1">
              <div className="font-mono text-xs text-red-600">
                <Link href={`/jobs/${digest.lastFailed.id}`}>{digest.lastFailed.id}</Link>
              </div>
              <div className="text-xs text-muted">
                {digest.lastFailed.completedAt
                  ? formatDate(digest.lastFailed.completedAt)
                  : formatDate(digest.lastFailed.createdAt)}
              </div>
              {digest.lastFailed.error && (
                <p className="text-xs text-red-600 line-clamp-3">{digest.lastFailed.error}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-2">No failed jobs recorded.</p>
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
        <p className="text-[11px] text-muted-2 mb-2">
          Full JSON with token-like keys masked. Raw secrets are never shown here.
        </p>
        <JsonPayloadViewer data={redactSourceConfigForDisplay(src.config)} maxCollapsedHeight={280} />
      </div>

      <div>
        <SectionHeader title="Recent jobs" description="Newest first — throughput and failures" />
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2 border-b border-border text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Status</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Trigger</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">
                  Fetched
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">
                  Norm
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase text-right">
                  Fail
                </th>
                <th className="px-3 py-2 text-[11px] font-semibold text-muted uppercase">Started</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(recentJobs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-2 text-sm">
                    No jobs for this source yet.
                  </td>
                </tr>
              ) : (
                (recentJobs ?? []).map((j) => (
                  <tr key={j.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2">{statusBadge(j.status)}</td>
                    <td className="px-3 py-2 text-xs text-muted">{j.triggeredBy}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{j.totalFetched}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">
                      {j.totalNormalized}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">{j.totalFailed}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {j.startedAt ? formatDate(j.startedAt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/jobs/${j.id}`} className="text-xs text-indigo-600 hover:opacity-80">
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
          <Link href={`/jobs?sourceId=${src.id}`} className="text-xs text-indigo-600 hover:opacity-80">
            View all jobs for this source →
          </Link>
        </div>
      </div>
    </div>
  );
}
