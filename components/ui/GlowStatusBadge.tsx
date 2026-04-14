type GlowStatus = "live" | "active" | "warning" | "error" | "idle" | "processing";

const config: Record<GlowStatus, { dot: string; glow: string; label: string; text: string; bg: string; border: string }> = {
  live: {
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_0_4px_rgba(34,197,94,0.16)]",
    label: "Live",
    text: "text-emerald-200",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
  },
  active: {
    dot: "bg-indigo-400",
    glow: "shadow-[0_0_0_4px_rgba(109,93,246,0.18)]",
    label: "Active",
    text: "text-indigo-200",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/25",
  },
  warning: {
    dot: "bg-amber-400",
    glow: "shadow-[0_0_0_4px_rgba(245,158,11,0.18)]",
    label: "Warning",
    text: "text-amber-200",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
  },
  error: {
    dot: "bg-red-400",
    glow: "shadow-[0_0_0_4px_rgba(239,68,68,0.18)]",
    label: "Error",
    text: "text-red-200",
    bg: "bg-red-500/10",
    border: "border-red-500/25",
  },
  idle: {
    dot: "bg-muted-2",
    glow: "",
    label: "Idle",
    text: "text-muted",
    bg: "bg-surface-2/50",
    border: "border-border",
  },
  processing: {
    dot: "bg-blue-400",
    glow: "shadow-[0_0_0_4px_rgba(59,130,246,0.18)]",
    label: "Processing",
    text: "text-blue-200",
    bg: "bg-blue-500/10",
    border: "border-blue-500/25",
  },
};

export default function GlowStatusBadge({
  status,
  label,
  pulse = false,
}: {
  status: GlowStatus;
  label?: string;
  pulse?: boolean;
}) {
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${c.text} ${c.bg} ${c.border}`}>
      <span className="relative flex h-2 w-2 shrink-0">
        {pulse ? (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-60`} />
        ) : null}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${c.dot} ${c.glow}`} />
      </span>
      {label ?? c.label}
    </span>
  );
}
