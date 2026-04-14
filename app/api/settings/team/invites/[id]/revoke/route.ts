import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canManageInvites, getActiveWorkspaceForEmail, getWorkspaceRole } from "@/server/authz/workspace";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await getActiveWorkspaceForEmail(email);
  if (!active) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const role = await getWorkspaceRole({ workspaceId: active.workspaceId, userId: active.userId });
  if (!canManageInvites(role)) {
    return NextResponse.json({ error: "Only workspace owners can revoke invites" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const inv = await prisma.workspaceInvite.findUnique({ where: { id } }).catch(() => null);
  if (!inv || inv.workspaceId !== active.workspaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (inv.status !== "PENDING") return NextResponse.json({ ok: true, note: "not_pending" });

  const updated = await prisma.workspaceInvite.update({ where: { id }, data: { status: "REVOKED" } });
  return NextResponse.json({ ok: true, data: updated });
}

