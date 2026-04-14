export default function ReportSummaryCards({ cards }: { cards: Array<{ label: string; value: unknown }> }) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  return (
    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.slice(0, 8).map((c) => (
        <div key={c.label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{c.label}</div>
          <div className="text-2xl font-semibold tabular-nums mt-1 text-foreground">{String(c.value ?? "—")}</div>
        </div>
      ))}
    </div>
  );
}

