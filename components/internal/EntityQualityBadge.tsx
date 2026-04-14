/**
 * Compact entity quality hint (confidence score + level) for admin detail headers.
 */
export default function EntityQualityBadge({
  overallScore,
  level,
  label = "Data quality",
}: {
  overallScore?: number | null;
  level?: string | null;
  label?: string;
}) {
  if (overallScore == null && (level == null || level === "")) return null;
  const pct = overallScore != null ? Math.round(Number(overallScore) * 100) : null;
  const tone =
    pct != null ? (pct >= 72 ? "text-emerald-600" : pct >= 48 ? "text-amber-600" : "text-red-600") : "text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5 rounded border border-border bg-surface-2 ${tone}`}
      title="Derived from normalization confidence scoring"
    >
      <span className="text-muted normal-case tracking-normal">{label}</span>
      {level ? <span>{level}</span> : null}
      {pct != null ? <span className="tabular-nums">{pct}%</span> : null}
    </span>
  );
}
