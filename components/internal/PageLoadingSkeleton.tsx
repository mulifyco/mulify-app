export default function PageLoadingSkeleton({ titleWidth = "w-56" }: { titleWidth?: string }) {
  return (
    <div className="animate-pulse space-y-6" aria-hidden aria-busy>
      <div className={`h-9 ${titleWidth} rounded-lg bg-surface-2`} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`skel-${i}`} className="h-24 rounded-xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-48 rounded-xl border border-border bg-card" />
      <div className="h-64 rounded-xl border border-border bg-card" />
    </div>
  );
}
