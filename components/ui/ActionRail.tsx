import type { ReactNode } from "react";

export default function ActionRail({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {children}
    </div>
  );
}

export function ActionRailButton({
  children,
  onClick,
  variant = "default",
  disabled = false,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const variants: Record<string, string> = {
    default:
      "border border-border bg-card/60 glass text-foreground hover:bg-surface-2/60 hover:border-border/80",
    primary:
      "border border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20",
    danger:
      "border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
    ghost:
      "text-muted hover:text-foreground hover:bg-surface-2/40",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
