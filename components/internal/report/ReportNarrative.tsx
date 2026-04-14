function pickTopItem(summary: any): { label: string; score: number | null } | null {
  const arr = Array.isArray(summary?.topItems) ? summary.topItems : null;
  if (!arr || arr.length === 0) return null;
  const first = arr[0] ?? {};
  const label = first.label ?? first.domain ?? first.title ?? "Top item";
  const score = typeof first.score === "number" ? first.score : typeof first.trendScore === "number" ? first.trendScore : null;
  return { label: String(label), score };
}

function riskLine(type: string, summary: any): string | null {
  if (type === "BOARD_SNAPSHOT") {
    const items = Array.isArray(summary?.topItems) ? summary.topItems : [];
    const worst = items.find((x: any) => (x?.storeCount ?? 999) <= 1) ? "Low storeCount indicates early/fragile signal." : null;
    return worst;
  }
  if (type === "COMPARE_SNAPSHOT") {
    const missing = Array.isArray(summary?.missing) ? summary.missing.length : 0;
    if (missing > 0) return `Some stores are missing/partial (${missing}). Validate store linkage before decisions.`;
  }
  if (type === "WATCHLIST_SNAPSHOT") {
    const alerts = Array.isArray(summary?.topItems?.alerts) ? summary.topItems.alerts : [];
    const high = alerts.filter((a: any) => a?.severity === "HIGH").length;
    if (high > 0) return `High severity spikes detected (${high}). Prioritize verification and follow-up.`;
  }
  return null;
}

function nextActions(type: string): string[] {
  if (type === "BOARD_SNAPSHOT") return ["Open top item and review creatives + landing pages", "Add top store(s) to a watchlist", "Create a saved filter to track this theme"];
  if (type === "WATCHLIST_SNAPSHOT") return ["Open compare for the watchlist", "Inspect recent spikes and related boards", "Create saved filters for recurring signals"];
  if (type === "COMPARE_SNAPSHOT") return ["Drill into top clusters per store", "Save the domain set as a watchlist", "Re-run compare after the next sync cycle"];
  return ["Review worst sources and job failures", "Promote high-confidence discovery candidates", "Create watchlists for the hottest domains"];
}

export default function ReportNarrative({ type, summary }: { type: string; summary: any }) {
  const top = pickTopItem(summary);
  const risk = riskLine(type, summary);
  const actions = nextActions(type);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-2">Why this matters</div>
        <div className="text-sm text-foreground leading-relaxed">
          {top ? (
            <>
              The top signal is <span className="font-semibold">{top.label}</span>
              {top.score != null ? <> (score {Math.round(top.score)}).</> : <>.</>}
            </>
          ) : (
            <>This report captures a snapshot of current signals and operational context.</>
          )}
        </div>
        {risk ? <div className="mt-3 text-sm text-muted">Risk: {risk}</div> : null}
        {type === "BOARD_SNAPSHOT" && summary?.historical?.trendAccelerationCounts ? (
          <div className="mt-3 text-sm text-muted">
            <span className="font-medium text-foreground">vs 7 days ago: </span>
            warming {summary.historical.trendAccelerationCounts.up ?? 0}, cooling{" "}
            {summary.historical.trendAccelerationCounts.down ?? 0}, flat{" "}
            {summary.historical.trendAccelerationCounts.flat ?? 0} (top sample; needs daily snapshots).
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-2">Next actions</div>
        <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
          {actions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

