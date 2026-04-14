import Link from "next/link";

interface BoardPreviewSectionProps {
  title: string;
  description: string;
  viewAllHref: string;
  children: React.ReactNode;
}

export default function BoardPreviewSection({
  title,
  description,
  viewAllHref,
  children,
}: BoardPreviewSectionProps) {
  return (
    <section className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border bg-surface-2/35">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground tracking-tight">{title}</h2>
          <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">{description}</p>
        </div>
        <Link
          href={viewAllHref}
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:opacity-80 shrink-0 pt-0.5"
        >
          View all →
        </Link>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}
