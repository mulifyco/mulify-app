export default function LivePulseBadge({ label = "Live", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-[11px] font-semibold text-emerald-200 ${className}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_0_3px_rgba(34,197,94,0.18)]" />
      </span>
      {label}
    </span>
  );
}
