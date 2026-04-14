import { NextResponse } from "next/server";
import { GtmStage } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireGtmSession } from "@/server/authz/gtm";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

const STAGES = new Set<string>(Object.values(GtmStage));

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireGtmSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.gtmLead.findFirst({ where: { id, workspaceId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const next: Record<string, unknown> = {};
  if (typeof body.stage === "string" && STAGES.has(body.stage)) {
    next.stage = body.stage as GtmStage;
  }
  if (typeof body.nextFollowUpAt === "string") {
    const d = new Date(body.nextFollowUpAt);
    if (!Number.isNaN(d.getTime())) next.nextFollowUpAt = d;
  }
  if (body.nextFollowUpAt === null) next.nextFollowUpAt = null;
  if (typeof body.estimatedMRR === "number") next.estimatedMRR = Math.max(0, Math.round(body.estimatedMRR));
  if (typeof body.priorityScore === "number") next.priorityScore = Math.max(0, Math.min(100, Math.round(body.priorityScore)));
  if (typeof body.notes === "string") next.notes = body.notes.slice(0, 8000);
  if (typeof body.owner === "string") next.owner = body.owner.slice(0, 200);
  if (typeof body.painPoint === "string") next.painPoint = body.painPoint.slice(0, 4000);
  if (typeof body.name === "string") next.name = body.name.slice(0, 200) || null;
  if (typeof body.company === "string" && body.company.trim()) next.company = body.company.trim();
  if (typeof body.email === "string") next.email = body.email.trim().toLowerCase() || null;
  if (typeof body.website === "string") next.website = body.website.trim() || null;
  if (typeof body.linkedinUrl === "string") next.linkedinUrl = body.linkedinUrl.trim() || null;

  const prevStage = existing.stage;
  const updated = await prisma.gtmLead.update({
    where: { id },
    data: next as any,
  });

  if (typeof body.stage === "string" && body.stage !== prevStage) {
    await prisma.gtmActivity.create({
      data: {
        workspaceId,
        leadId: id,
        type: "STAGE_CHANGE",
        note: `${prevStage} → ${body.stage}`,
      },
    });
  }

  return NextResponse.json({ ok: true, data: updated });
}
