import { NextResponse } from "next/server";
import { GtmStage } from "@prisma/client";
import { requireGtmSession } from "@/server/authz/gtm";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";
import { createOrMergeGtmLead, listGtmLeadsByStageForWorkspace } from "@/server/services/gtm.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireGtmSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const byStage = await listGtmLeadsByStageForWorkspace(workspaceId);
  return NextResponse.json({ byStage });
}

export async function POST(req: Request) {
  const session = await requireGtmSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!company) return NextResponse.json({ error: "company is required" }, { status: 400 });

  try {
    const res = await createOrMergeGtmLead({
      workspaceId,
      company,
      name: typeof body.name === "string" ? body.name : null,
      website: typeof body.website === "string" ? body.website : null,
      email: typeof body.email === "string" ? body.email : null,
      linkedinUrl: typeof body.linkedinUrl === "string" ? body.linkedinUrl : null,
      source: typeof body.source === "string" ? body.source : "manual",
      painPoint: typeof body.painPoint === "string" ? body.painPoint : "",
      estimatedMRR: typeof body.estimatedMRR === "number" ? body.estimatedMRR : 0,
      stage: typeof body.stage === "string" && (Object.values(GtmStage) as string[]).includes(body.stage) ? (body.stage as GtmStage) : "PROSPECT",
      priorityScore: typeof body.priorityScore === "number" ? body.priorityScore : 50,
      owner: typeof body.owner === "string" ? body.owner : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
