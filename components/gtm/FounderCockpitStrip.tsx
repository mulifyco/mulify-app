import Link from "next/link";

export default function FounderCockpitStrip({
  demosThisWeek,
  pipelineMRR,
  followUpsToday,
  overdueFollowUps,
  trialsActive,
  payingUsersApprox,
}: {
  demosThisWeek: number;
  pipelineMRR: number;
  followUpsToday: number;
  overdueFollowUps: number;
  trialsActive: number;
  payingUsersApprox: number;
}) {
  return (
    <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.06] px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.16em]">Founder GTM</div>
        <Link href="/gtm" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
          Open GTM →
        </Link>
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
        <div>
          <div className="text-[10px] text-muted">Demos (week)</div>
          <div className="font-semibold tabular-nums text-foreground">{demosThisWeek}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted">Pipeline MRR</div>
          <div className="font-semibold tabular-nums text-foreground">${pipelineMRR.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted">Follow-ups today</div>
          <div className="font-semibold tabular-nums text-foreground">{followUpsToday}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted">Overdue</div>
          <div className={`font-semibold tabular-nums ${overdueFollowUps > 0 ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>
            {overdueFollowUps}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted">GTM trials</div>
          <div className="font-semibold tabular-nums text-foreground">{trialsActive}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted">Paying users (approx)</div>
          <div className="font-semibold tabular-nums text-foreground">{payingUsersApprox}</div>
        </div>
      </div>
    </div>
  );
}
