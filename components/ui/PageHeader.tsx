interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  eyebrow?: string;
  badge?: React.ReactNode;
}

export default function PageHeader({ title, description, action, eyebrow, badge }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6 mb-6">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.22em] mb-1">{eyebrow}</div>
        ) : null}
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold text-foreground tracking-tight">{title}</h1>
          {badge ? badge : null}
        </div>
        {description && (
          <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">{description}</p>
        )}
      </div>
      {action && (
        <div className="shrink-0 w-full sm:w-auto flex flex-wrap gap-2 justify-start sm:justify-end">
          {action}
        </div>
      )}
    </div>
  );
}
