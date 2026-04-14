import { NextResponse } from "next/server";
import { requireGtmSession } from "@/server/authz/gtm";
import { promoteCrmLeadToGtm } from "@/server/services/gtm.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await requireGtmSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { crmLeadId?: unknown } | null;
  const crmLeadId = typeof body?.crmLeadId === "string" ? body.crmLeadId.trim() : "";
  if (!crmLeadId) return NextResponse.json({ error: "crmLeadId is required" }, { status: 400 });

  try {
    const res = await promoteCrmLeadToGtm(crmLeadId);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
