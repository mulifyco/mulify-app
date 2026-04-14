import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import type { WorkspaceRole as PrismaWorkspaceRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendWorkspaceInviteEmail } from "@/lib/workspace/invite-email";
import { seatLimitForPlan } from "@/lib/workspace/seats";
import {
  canManageInvites,
  canManageWorkspaceMembers,
  canViewInvites,
  canViewWorkspaceTeam,
  getActiveWorkspaceForEmail,
  getWorkspaceRole,
  isWorkspaceRole,
} from "@/server/authz/workspace";

export const dynamic = "force-dynamic";

function randomInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function GET() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await getActiveWorkspaceForEmail(email);
  if (!active) return NextResponse.json({ data: [], members: [], seat: null, capabilities: null });

  const workspaceRole = await getWorkspaceRole({ workspaceId: active.workspaceId, userId: active.userId });
  if (!canViewWorkspaceTeam(workspaceRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [members, ws] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: active.workspaceId },
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.workspace.findUnique({
      where: { id: active.workspaceId },
      select: { billingPlan: true, name: true },
    }),
  ]);

  const limit = seatLimitForPlan(ws?.billingPlan ?? "FREE");
  const memberCount = members.length;

  const viewInvites = canViewInvites(workspaceRole);
  const invites = viewInvites
    ? await prisma.workspaceInvite.findMany({
        where: { workspaceId: active.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

  const pendingCount = viewInvites
    ? invites.filter((i) => i.status === "PENDING").length
    : await prisma.workspaceInvite.count({
        where: { workspaceId: active.workspaceId, status: "PENDING" },
      });

  const occupied = memberCount + pendingCount;

  return NextResponse.json({
    data: invites,
    members: members.map((m) => ({ id: m.id, userId: m.userId, email: m.user.email, role: m.role })),
    seat: {
      limit,
      memberCount,
      pendingCount,
      occupied,
    },
    capabilities: {
      role: workspaceRole,
      viewerEmail: email,
      canViewInvites: viewInvites,
      canCreateInvite: canManageInvites(workspaceRole),
      canRevokeInvite: canManageInvites(workspaceRole),
      canManageMembers: canManageWorkspaceMembers(workspaceRole),
      canManageBilling: workspaceRole === "OWNER",
    },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await getActiveWorkspaceForEmail(email);
  if (!active) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const workspaceRole = await getWorkspaceRole({ workspaceId: active.workspaceId, userId: active.userId });
  if (!canManageInvites(workspaceRole)) {
    return NextResponse.json({ error: "Only workspace owners can send invites" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const inviteEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  let inviteRole = typeof body?.role === "string" ? body.role.trim().toUpperCase() : "ANALYST";
  if (!isWorkspaceRole(inviteRole) || inviteRole === "OWNER") {
    inviteRole = "ANALYST";
  }
  if (!inviteEmail) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const ws = await prisma.workspace.findUnique({
    where: { id: active.workspaceId },
    select: { billingPlan: true, name: true },
  });
  const limit = seatLimitForPlan(ws?.billingPlan ?? "FREE");

  const memberCount = await prisma.workspaceMember.count({ where: { workspaceId: active.workspaceId } });
  const pendingInviteCount = await prisma.workspaceInvite.count({
    where: { workspaceId: active.workspaceId, status: "PENDING" },
  });
  const occupied = memberCount + pendingInviteCount;

  if (occupied >= limit) {
    return NextResponse.json({ error: "Seat limit reached (includes pending invites)" }, { status: 400 });
  }

  const alreadyMember = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: active.workspaceId,
      user: { email: { equals: inviteEmail, mode: "insensitive" } },
    },
    select: { id: true },
  });
  if (alreadyMember) {
    return NextResponse.json({ error: "User is already a member of this workspace" }, { status: 400 });
  }

  const existing = await prisma.workspaceInvite.findFirst({
    where: { workspaceId: active.workspaceId, email: inviteEmail, status: "PENDING" },
    select: { id: true, token: true, expiresAt: true },
  });
  if (existing) {
    const inviteUrl = `/accept-invite?token=${encodeURIComponent(existing.token)}`;
    return NextResponse.json({
      data: { id: existing.id, token: existing.token, inviteUrl },
      note: "already_pending",
    });
  }

  const token = randomInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 86400000);
  const created = await prisma.workspaceInvite.create({
    data: {
      workspaceId: active.workspaceId,
      email: inviteEmail,
      role: inviteRole as PrismaWorkspaceRole,
      token,
      status: "PENDING",
      expiresAt,
    },
  });

  const inviteUrl = `/accept-invite?token=${encodeURIComponent(token)}`;
  const origin =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? process.env.AUTH_URL?.replace(/\/$/, "") ?? "";
  const absoluteInviteUrl = origin ? `${origin}${inviteUrl}` : inviteUrl;

  await sendWorkspaceInviteEmail({
    to: inviteEmail,
    workspaceName: ws?.name ?? "Workspace",
    inviteUrl: absoluteInviteUrl,
    role: inviteRole,
  }).catch(() => {});

  return NextResponse.json(
    {
      data: { ...created, inviteUrl, inviteUrlAbsolute: absoluteInviteUrl },
    },
    { status: 201 }
  );
}
