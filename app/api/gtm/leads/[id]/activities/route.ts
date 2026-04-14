import { NextResponse } from "next/server";
import { requireGtmSession } from "@/server/authz/gtm";
import { recordGtmActivity } from "@/server/services/gtm.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireGtmSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id: leadId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { type?: unknown; note?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  const note = typeof body.note === "string" ? body.note : "";

  const res = await recordGtmActivity(workspaceId, leadId, type, note);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
