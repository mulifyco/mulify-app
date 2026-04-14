/** 7d score delta from daily snapshots (positive = heating up). */
export default function BoardDeltaBadge({ delta }: { delta: number | null | undefined }) {
  if (delta == null || Number.isNaN(delta)) {
    return (
      <span className="text-[10px] text-muted-2 tabular-nums" title="Historical snapshots will appear after the worker runs.">
        —
      </span>
    );
  }
  const abs = Math.abs(delta);
  const label = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  if (delta > 0.75) {
    return (
      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
        ↑ {label} <span className="text-muted-2 font-normal">7d</span>
      </span>
    );
  }
  if (delta < -0.75) {
    return (
      <span className="text-[10px] font-medium text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
        ↓ {label} <span className="text-muted-2 font-normal">7d</span>
      </span>
    );
  }
  return (
    <span className="text-[10px] text-muted tabular-nums whitespace-nowrap">
      → <span className="text-muted-2">flat</span>
    </span>
  );
}
