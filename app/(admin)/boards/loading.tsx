export default function BoardsDashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="h-10 w-48 rounded-md bg-surface-2" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-border bg-card" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-56 rounded-lg border border-border bg-card" />
      ))}
    </div>
  );
}
