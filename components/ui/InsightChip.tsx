import type { ReactNode } from "react";

type InsightChipVariant = "default" | "success" | "warning" | "danger" | "indigo" | "purple" | "amber";

const variantStyles: Record<InsightChipVariant, string> = {
  default: "text-muted border-border bg-surface-2/50",
  success: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  warning: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  danger: "text-red-300 border-red-500/30 bg-red-500/10",
  indigo: "text-indigo-300 border-indigo-500/30 bg-indigo-500/10",
  purple: "text-purple-300 border-purple-500/30 bg-purple-500/10",
  amber: "text-amber-300 border-amber-500/30 bg-amber-500/10",
};

const dotStyles: Record<InsightChipVariant, string> = {
  default: "bg-muted-2",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-red-400",
  indigo: "bg-indigo-400",
  purple: "bg-purple-400",
  amber: "bg-amber-400",
};

export default function InsightChip({
  children,
  variant = "default",
  dot = false,
  icon,
  className = "",
}: {
  children: ReactNode;
  variant?: InsightChipVariant;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${variantStyles[variant]} ${className}`}
    >
      {dot ? <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotStyles[variant]}`} /> : null}
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </span>
  );
}
