import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import Pagination from "@/components/ui/Pagination";
import QueryErrorState from "@/components/internal/QueryErrorState";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/date";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";
import PaywallPanel from "@/components/internal/PaywallPanel";
import EmptyState from "@/components/internal/EmptyState";
import CreateReportButton from "@/components/internal/CreateReportButton";
import LoadDemoWorkspaceButton from "@/components/launch/LoadDemoWorkspaceButton";

export const dynamic = "force-dynamic";

function statusVariant(s: string): "green" | "yellow" | "default" {
  if (s === "READY") return "green";
  if (s === "DRAFT") return "yellow";
  return "default";
}

function typeVariant(t: string): "purple" | "blue" | "default" {
  if (t === "EXECUTIVE_SUMMARY") return "purple";
  if (t === "BOARD_SNAPSHOT") return "blue";
  if (t === "WATCHLIST_SNAPSHOT") return "blue";
  if (t === "COMPARE_SNAPSHOT") return "blue";
  return "default";
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await auth();
  const plan = getUserPlan(session);
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 25;
  const skip = (page - 1) * pageSize;

  type ReportRow = { id: string; title: string; type: string; status: string; createdAt: Date };
  let rows: ReportRow[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    if (canAccessFeature(plan, "REPORTS")) {
      const [items, cnt] = await Promise.all([
        prisma.report.findMany({
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
          select: { id: true, title: true, type: true, status: true, createdAt: true },
        }),
        prisma.report.count(),
      ]);
      rows = items;
      total = cnt;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load reports.";
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Shareable snapshots generated from boards, watchlists, compare, and executive dashboard."
        action={
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
              ← Dashboard
            </Link>
          </div>
        }
      />

      {!canAccessFeature(plan, "REPORTS") ? (
        <div className="mb-6">
          <PaywallPanel
            feature="REPORTS"
            currentPlan={plan}
            title="Reports are a Pro feature"
            description="Upgrade to generate shareable snapshots and export them as JSON, CSV, and PDF."
          />
        </div>
      ) : null}

      {error ? (
        <QueryErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Freeze what you see on the executive dashboard, a board, compare, or a watchlist — then share JSON, CSV, or PDF with your team."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <LoadDemoWorkspaceButton label="Load sample workspace" />
              <CreateReportButton
                label="Generate sample report"
                variant="primary"
                payload={{ type: "EXECUTIVE_SUMMARY", context: { scope: "default" } }}
              />
              <Link
                href="/dashboard"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
              >
                Open dashboard
              </Link>
              <Link href="/boards" className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2">
                Browse boards
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Created</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Title</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2.5 w-44" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/70">
                    <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/reports/${r.id}`} className="text-sm font-medium text-foreground hover:opacity-80">
                        {r.title}
                      </Link>
                      <div className="text-[11px] text-muted-2 mt-0.5">
                        Snapshot · <span className="font-mono">{r.id.slice(0, 10)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <Badge label={String(r.type)} variant={typeVariant(String(r.type))} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge label={String(r.status)} variant={statusVariant(String(r.status))} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <a
                          href={`/api/reports/${r.id}/export.pdf`}
                          className="text-xs text-muted hover:opacity-80"
                        >
                          PDF
                        </a>
                        <a
                          href={`/api/reports/${r.id}/export.json`}
                          className="text-xs text-muted hover:opacity-80"
                        >
                          JSON
                        </a>
                        <a
                          href={`/api/reports/${r.id}/export.csv`}
                          className="text-xs text-muted hover:opacity-80"
                        >
                          CSV
                        </a>
                        <Link href={`/reports/${r.id}`} className="text-xs text-indigo-600 hover:opacity-80">
                          Open →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={total} page={page} pageSize={pageSize} totalPages={Math.ceil(total / pageSize)} />
        </>
      )}
    </div>
  );
}

