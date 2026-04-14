import type { ReactNode } from "react";

export default function SectionShell({
  title,
  description,
  actions,
  eyebrow,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || actions || eyebrow) && (
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.22em] mb-1">{eyebrow}</div>
            ) : null}
            {title ? (
              <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-xs text-muted mt-0.5 max-w-xl">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
