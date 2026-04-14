import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import QueryErrorState from "@/components/internal/QueryErrorState";
import ReportHeader from "@/components/internal/report/ReportHeader";
import ReportSummaryCards from "@/components/internal/report/ReportSummaryCards";
import ReportNarrative from "@/components/internal/report/ReportNarrative";
import ReportTopItemsSection from "@/components/internal/report/ReportTopItemsSection";
import type { Report } from "@prisma/client";

export const dynamic = "force-dynamic";

function summaryRecord(summary: Report["summary"]): Record<string, unknown> | null {
  return summary && typeof summary === "object" && !Array.isArray(summary) ? (summary as Record<string, unknown>) : null;
}

function ReportDetailContent({
  row,
  view,
}: {
  row: Report;
  view: "default" | "compact" | "print";
}) {
  const sum = summaryRecord(row.summary);
  const cards = Array.isArray(sum?.cards) ? (sum.cards as Array<{ label: string; value: unknown }>) : [];

  return (
    <>
      <ReportHeader
        title={row.title ?? "Report"}
        type={String(row.type)}
        status={String(row.status)}
        createdAt={String(sum?.generatedAt ?? row.createdAt?.toISOString?.() ?? "—")}
        reportId={row.id}
        view={view}
      />

      <ReportSummaryCards cards={cards} />

      <ReportNarrative type={String(row.type)} summary={row.summary ?? null} />

      <ReportTopItemsSection type={String(row.type)} summary={row.summary ?? null} />

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-2">Context / filters used</div>
        <JsonPayloadViewer data={row.sourceContext ?? {}} maxCollapsedHeight={480} />
      </div>
    </>
  );
}

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const view = sp.view === "print" ? "print" : sp.view === "compact" ? "compact" : "default";

  let row: Report | null = null;
  let error: string | null = null;
  try {
    row = await prisma.report.findUnique({ where: { id } });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load report.";
  }

  if (!row && !error) notFound();

  return (
    <div className={`min-w-0 space-y-6 overflow-x-hidden ${view === "print" ? "print:bg-white" : ""}`}>
      {error ? (
        <QueryErrorState message={error} />
      ) : !row ? null : (
        <>
          <ReportHeader
            title={row.title ?? "Report"}
            type={String(row.type)}
            status={String(row.status)}
            createdAt={String(
              summaryRecord(row.summary)?.generatedAt ?? row.createdAt?.toISOString?.() ?? "—"
            )}
            reportId={row.id}
            view={view}
          />

          <ReportSummaryCards
            cards={
              Array.isArray(summaryRecord(row.summary)?.cards)
                ? (summaryRecord(row.summary)!.cards as Array<{ label: string; value: unknown }>)
                : []
            }
          />

          <ReportNarrative type={String(row.type)} summary={row.summary ?? null} />

          <ReportTopItemsSection type={String(row.type)} summary={row.summary ?? null} />

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-2">Context / filters used</div>
            <JsonPayloadViewer data={row.sourceContext ?? {}} maxCollapsedHeight={480} />
          </div>
        </>
      )}

      {row && view !== "default" ? (
        <div className={`text-center ${view === "print" ? "print:hidden" : ""}`}>
          <Link href={`/reports/${row.id}`} className="text-xs text-muted hover:opacity-80">
            Exit {view} view →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

