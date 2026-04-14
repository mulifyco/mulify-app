import Badge from "@/components/ui/Badge";
import Link from "next/link";

function statusVariant(s: string): "green" | "yellow" | "default" {
  if (s === "READY") return "green";
  if (s === "DRAFT") return "yellow";
  return "default";
}

export default function ReportHeader({
  title,
  type,
  status,
  createdAt,
  reportId,
  view,
}: {
  title: string;
  type: string;
  status: string;
  createdAt: string;
  reportId: string;
  view: "default" | "compact" | "print";
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] text-muted uppercase tracking-[0.18em]">Report</div>
            <div className="mt-1 text-xl font-semibold tracking-tight text-foreground truncate">{title}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge label={type} variant="default" />
              <Badge label={status} variant={statusVariant(status)} />
              <span className="tabular-nums">{createdAt}</span>
              <span className="text-muted-2 font-mono">#{reportId.slice(0, 10)}</span>
            </div>
          </div>

          <div
            className={`flex flex-wrap items-stretch gap-2 lg:justify-end lg:shrink-0 ${view === "print" ? "print:hidden" : ""}`}
          >
            <Link href="/reports" className="px-3 py-1.5 text-xs rounded border border-border hover:bg-surface-2">
              ← Reports
            </Link>
            <a
              href={`/api/reports/${reportId}/export.pdf`}
              className="px-3 py-1.5 text-xs rounded border border-border hover:bg-surface-2"
            >
              PDF
            </a>
            <a
              href={`/api/reports/${reportId}/export.json`}
              className="px-3 py-1.5 text-xs rounded border border-border hover:bg-surface-2"
            >
              JSON
            </a>
            <a
              href={`/api/reports/${reportId}/export.csv`}
              className="px-3 py-1.5 text-xs rounded border border-border hover:bg-surface-2"
            >
              CSV
            </a>
            <a
              href={`/reports/${reportId}?view=print`}
              className="px-3 py-1.5 text-xs rounded bg-foreground text-background hover:opacity-90"
            >
              Print view
            </a>
          </div>
        </div>
      </div>

      {view !== "default" ? (
        <div className="px-5 py-3 border-t border-border bg-surface-2/30 text-xs text-muted">
          {view === "print"
            ? "Print-friendly layout (sidebar/actions hidden on print)."
            : "Compact layout (reduced chrome)."}
        </div>
      ) : null}
    </div>
  );
}

