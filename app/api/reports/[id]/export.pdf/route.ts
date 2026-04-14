import { NextResponse } from "next/server";
import { ProductEventType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { renderReportPdf } from "@/server/services/report-pdf.service";
import { canAccessFeature, getUserPlan, paywallResponse } from "@/lib/billing/access";
import { trackPaywallHitFromSession, trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "PDF_EXPORT")) {
    await trackPaywallHitFromSession(session, "PDF_EXPORT", "/api/reports/[id]/export.pdf");
    return NextResponse.json(paywallResponse("PDF_EXPORT", plan), { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    const { filename, pdf } = await renderReportPdf(id, workspaceId);
    void trackProductEventFromSession(session, {
      eventType: ProductEventType.REPORT_EXPORT,
      path: `/api/reports/${id}/export.pdf`,
      entityType: "REPORT",
      entityId: id,
      metadata: { format: "pdf" },
    });
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

