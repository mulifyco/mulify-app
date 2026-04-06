import Link from "next/link";
import { getDashboardStats } from "@/server/services/dashboard.service";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import SectionHeader from "@/components/internal/SectionHeader";
import { statusBadge } from "@/components/ui/Badge";
import { formatDate, timeAgo } from "@/lib/date";
import DashboardQuickActions from "@/components/internal/DashboardQuickActions";

export const dynamic = "force-dynamic";

function metricTone(n: number, bad: boolean): "default" | "yellow" | "red" {
  if (bad && n > 0) return "red";
  return "default";
}

export default async function DashboardPage() {
  const s = await getDashboardStats();
  const confTotal =
    s.confidenceAds.high + s.confidenceAds.medium + s.confidenceAds.low || 1;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Operations overview"
        description="Ingestion health, entity volumes, and recent sync activity"
      />

      <DashboardQuickActions />

      <div>
        <SectionHeader title="Volumes" description="Normalized intelligence counts" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Sources" value={s.totalSources} color="blue" />
          <StatCard label="Active sources" value={s.activeSources} />
          <StatCard label="Ads" value={s.totalAds} />
          <StatCard label="Stores" value={s.totalStores} />
          <StatCard label="Products" value={s.totalProducts} />
          <StatCard label="Collections" value={s.totalCollections} />
          <StatCard label="Landing pages" value={s.totalLandingPages} />
          <StatCard label="Raw records" value={s.totalRawRecords} />
        </div>
      </div>

      <div>
        <SectionHeader
          title="Sync & quality signals"
          description="Failure routing for triage"
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard
            label="Sources (error)"
            value={s.sourcesInError}
            color={metricTone(s.sourcesInError, true)}
          />
          <StatCard label="Running jobs" value={s.activeJobs} color="yellow" />
          <StatCard
            label="Failed jobs (24h)"
            value={s.failedJobs24h}
            color={metricTone(s.failedJobs24h, true)}
          />
          <StatCard label="Partial jobs (24h)" value={s.partialJobs24h} color="yellow" />
          <StatCard
            label="Raw failed"
            value={s.rawRecordsFailed}
            color={metricTone(s.rawRecordsFailed, true)}
          />
          <StatCard label="Raw normalized" value={s.rawRecordsNormalized} color="green" />
          <StatCard
            label="Low confidence (all)"
            value={s.entitiesLowConfidence}
            color={metricTone(s.entitiesLowConfidence, true)}
          />
          <StatCard
            label="Last sync"
            value={s.lastSyncAt ? timeAgo(s.lastSyncAt) : "—"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <SectionHeader title="Ad confidence (tracked)" />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>High</span>
              <span className="tabular-nums text-emerald-400">
                {s.confidenceAds.high}{" "}
                <span className="text-gray-600 text-xs">
                  ({Math.round((100 * s.confidenceAds.high) / confTotal)}%)
                </span>
              </span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Medium</span>
              <span className="tabular-nums text-amber-400">{s.confidenceAds.medium}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Low</span>
              <span className="tabular-nums text-red-400">{s.confidenceAds.low}</span>
            </div>
          </div>
          <Link
            href="/ads?confidenceMax=0.45"
            className="inline-block mt-4 text-xs text-indigo-400 hover:text-indigo-300"
          >
            Review low-scoring ads →
          </Link>
        </div>

        <div className="lg:col-span-2">
          <SectionHeader title="Recent sync jobs" />
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Source
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">
                    Fetched
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">
                    Norm
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-right">
                    Fail
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    Started
                  </th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {s.recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-gray-600 text-sm">
                      No jobs yet. Run a sync from Sources or use quick actions above.
                    </td>
                  </tr>
                ) : (
                  s.recentJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-900/50">
                      <td className="px-3 py-2.5">
                        <div className="text-gray-200">{job.sourceName}</div>
                        <div className="text-[11px] text-gray-600">{job.sourceType}</div>
                      </td>
                      <td className="px-3 py-2.5">{statusBadge(job.status)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                        {job.totalFetched}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-400/90">
                        {job.totalNormalized}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-400/80">
                        {job.totalFailed}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-500">
                        {job.startedAt
                          ? formatDate(job.startedAt)
                          : timeAgo(job.createdAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          Log
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
