import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  canAdminActOnMember,
  canAssignMemberRole,
  canManageWorkspaceMembers,
  getActiveWorkspaceForEmail,
  getWorkspaceRole,
  isWorkspaceRole,
} from "@/server/authz/workspace";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveWorkspaceForEmail(email);
  if (!active) return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  const actorRole = await getWorkspaceRole({ workspaceId: active.workspaceId, userId: active.userId });
  if (!canManageWorkspaceMembers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const nextRoleRaw = typeof body?.role === "string" ? body.role.trim().toUpperCase() : "";
  if (!nextRoleRaw || !isWorkspaceRole(nextRoleRaw)) {
    return NextResponse.json({ error: "role is required" }, { status: 400 });
  }
  const nextRole = nextRoleRaw;

  if (!canAssignMemberRole(actorRole, nextRole)) {
    return NextResponse.json({ error: "Only owners can assign the OWNER role" }, { status: 403 });
  }

  const member = await prisma.workspaceMember.findUnique({ where: { id } }).catch(() => null);
  if (!member || member.workspaceId !== active.workspaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targetRole = member.role as "OWNER" | "ADMIN" | "ANALYST" | "VIEWER";
  if (!canAdminActOnMember(actorRole, targetRole)) {
    return NextResponse.json({ error: "Admins cannot modify workspace owners" }, { status: 403 });
  }

  if (member.role === "OWNER" && nextRole !== "OWNER") {
    const owners = await prisma.workspaceMember.count({
      where: { workspaceId: active.workspaceId, role: "OWNER" },
    });
    if (owners <= 1) return NextResponse.json({ error: "Cannot downgrade the last OWNER" }, { status: 400 });
  }

  const updated = await prisma.workspaceMember.update({ where: { id }, data: { role: nextRole } });
  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveWorkspaceForEmail(email);
  if (!active) return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  const actorRole = await getWorkspaceRole({ workspaceId: active.workspaceId, userId: active.userId });
  if (!canManageWorkspaceMembers(actorRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const member = await prisma.workspaceMember.findUnique({ where: { id } }).catch(() => null);
  if (!member || member.workspaceId !== active.workspaceId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targetRole = member.role as "OWNER" | "ADMIN" | "ANALYST" | "VIEWER";
  if (!canAdminActOnMember(actorRole, targetRole)) {
    return NextResponse.json({ error: "Admins cannot remove workspace owners" }, { status: 403 });
  }

  if (member.role === "OWNER") {
    const owners = await prisma.workspaceMember.count({
      where: { workspaceId: active.workspaceId, role: "OWNER" },
    });
    if (owners <= 1) return NextResponse.json({ error: "Cannot remove the last OWNER" }, { status: 400 });
  }

  await prisma.workspaceMember.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
