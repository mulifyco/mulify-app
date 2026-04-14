import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
  className?: string;
}

export default function SectionHeader({ title, description, action, eyebrow, className = "" }: SectionHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.22em] mb-1">{eyebrow}</div>
        ) : null}
        <h2 className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em]">{title}</h2>
        {description ? <p className="text-xs text-muted-2 mt-0.5">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
