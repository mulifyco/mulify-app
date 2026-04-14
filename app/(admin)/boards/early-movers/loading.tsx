export default function EarlyMoversBoardLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-8 w-64 rounded-md bg-surface-2" />
      <div className="h-4 w-full max-w-xl rounded bg-surface-2" />
      <div className="h-24 rounded-lg border border-border bg-card" />
      <div className="h-[420px] rounded-lg border border-border bg-card" />
    </div>
  );
}

