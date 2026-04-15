import { NextResponse } from "next/server";
import { ProductEventType } from "@/lib/analytics/product-event-types";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0] ?? {});
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape((r as any)[h])).join(","));
  }
  return lines.join("\n");
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const row = await prisma.report.findFirst({ where: { id, workspaceId } }).catch(() => null);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const summary = (row.summary ?? {}) as any;

  let items: any[] = [];
  if (Array.isArray(summary.topItems)) items = summary.topItems;
  if (summary.topItems?.productClusters && Array.isArray(summary.topItems.productClusters)) {
    items = summary.topItems.productClusters;
  }
  if (summary.topItems?.creativeClusters && Array.isArray(summary.topItems.creativeClusters)) {
    items = summary.topItems.creativeClusters;
  }
  if (summary.topItems?.alerts && Array.isArray(summary.topItems.alerts)) {
    items = summary.topItems.alerts;
  }
  if (Array.isArray(summary.topItems)) items = summary.topItems;

  const csvRows: Array<Record<string, unknown>> = [];

  // BOARD_SNAPSHOT normalized format
  if (row.type === "BOARD_SNAPSHOT") {
    for (const it of items.slice(0, 200)) {
      csvRows.push({
        id: it.id ?? it.clusterId ?? "",
        label: it.label ?? it.previewLabel ?? it.title ?? "",
        score: it.score ?? "",
        storeCount: it.storeCount ?? "",
        lastSeenAt: it.lastSeenAt ?? "",
      });
    }
  } else if (row.type === "COMPARE_SNAPSHOT") {
    const stores = Array.isArray(summary.topItems) ? summary.topItems : Array.isArray(summary.topItems?.stores) ? summary.topItems.stores : summary.topItems;
    const arr = Array.isArray(stores) ? stores : [];
    for (const s of arr.slice(0, 200)) {
      csvRows.push({
        domain: s.domain ?? "",
        trendScore: s.trendScore ?? "",
        linkedProductClusters: s.linkedProductClusters ?? s.linkedProductClusterCount ?? "",
        linkedCreativeClusters: s.linkedCreativeClusters ?? s.linkedCreativeClusterCount ?? "",
        avgReadyToScaleScore: s.avgReadyToScaleScore ?? "",
        avgEarlyMoverScore: s.avgEarlyMoverScore ?? "",
      });
    }
  } else if (row.type === "WATCHLIST_SNAPSHOT") {
    // alerts export
    const alerts = Array.isArray(summary.topItems?.alerts) ? summary.topItems.alerts : [];
    for (const a of alerts.slice(0, 200)) {
      csvRows.push({
        id: a.id ?? "",
        type: a.type ?? "",
        severity: a.severity ?? "",
        title: a.title ?? "",
        createdAt: a.createdAt ?? "",
      });
    }
  } else {
    // EXECUTIVE_SUMMARY fallback: cards as rows
    const cards = Array.isArray(summary.cards) ? summary.cards : [];
    for (const c of cards.slice(0, 200)) {
      csvRows.push({ label: c.label ?? "", value: c.value ?? "" });
    }
  }

  void trackProductEventFromSession(session, {
    eventType: ProductEventType.REPORT_EXPORT,
    path: `/api/reports/${row.id}/export.csv`,
    entityType: "REPORT",
    entityId: row.id,
    metadata: { format: "csv", reportType: row.type },
  });

  const csv = rowsToCsv(csvRows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=\"report-${row.id}.csv\"`,
    },
  });
}

