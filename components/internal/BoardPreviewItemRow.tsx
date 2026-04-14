import Link from "next/link";
import Badge from "@/components/ui/Badge";

interface BoardPreviewItemRowProps {
  href: string;
  title: string;
  subtitle?: string | null;
  scoreLabel: string;
  scoreValue: string;
  scoreVariant?: "default" | "green" | "yellow" | "red" | "blue" | "purple";
  meta: string[];
  leading?: React.ReactNode;
}

export default function BoardPreviewItemRow({
  href,
  title,
  subtitle,
  scoreLabel,
  scoreValue,
  scoreVariant = "default",
  meta,
  leading,
}: BoardPreviewItemRowProps) {
  return (
    <Link
      href={href}
      className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-surface-2/55 transition-colors group"
    >
      {leading ? <div className="shrink-0">{leading}</div> : null}
      <div className="flex-1 min-w-[180px]">
        <div className="text-sm font-medium text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 line-clamp-2">
          {title}
        </div>
        {subtitle ? (
          <div className="text-[11px] text-muted-2 font-mono truncate mt-0.5">{subtitle}</div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 justify-end sm:justify-end w-full sm:w-auto">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted uppercase tracking-wide hidden sm:inline">{scoreLabel}</span>
          <Badge label={scoreValue} variant={scoreVariant} />
        </div>
        <div className="text-[11px] text-muted tabular-nums text-right sm:min-w-[140px] sm:text-right flex-1 sm:flex-initial">
          {meta.length ? meta.join(" · ") : "—"}
        </div>
      </div>
    </Link>
  );
}
