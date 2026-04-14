export default function WatchlistsLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="h-10 w-56 rounded-md bg-surface-2" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 rounded-lg border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
