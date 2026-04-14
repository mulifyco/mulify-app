import type { ReactNode } from "react";

export default function EmptyStatePremium({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-card/60 to-surface-2/20 glass px-6 py-12 text-center ${className}`}
    >
      {icon ? (
        <div className="mx-auto mb-4 h-12 w-12 rounded-2xl border border-border bg-surface-2/60 glass flex items-center justify-center text-xl text-muted">
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
