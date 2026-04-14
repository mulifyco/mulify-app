import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export default function EmptyState({ title, description, action, icon, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-card/60 to-surface-2/20 glass px-6 py-12 text-center ${className}`}
    >
      {icon ? (
        <div className="mx-auto mb-4 h-11 w-11 rounded-2xl border border-border bg-surface-2/60 glass flex items-center justify-center text-lg text-muted">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-foreground tracking-tight">{title}</p>
      {description ? (
        <p className="text-xs text-muted mt-2 max-w-md mx-auto leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
