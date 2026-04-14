import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { seatLimitForPlan } from "@/lib/workspace/seats";

export const dynamic = "force-dynamic";

class InviteAcceptError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  try {
    const workspaceId = await prisma.$transaction(async (tx) => {
      const inv = await tx.workspaceInvite.findUnique({ where: { token } });
      if (!inv) throw new InviteAcceptError(404, "Invalid token");
      if (inv.status !== "PENDING") throw new InviteAcceptError(400, "Invite is not pending");
      if (inv.expiresAt.getTime() < Date.now()) {
        await tx.workspaceInvite.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
        throw new InviteAcceptError(400, "Invite expired");
      }
      if (inv.email.toLowerCase() !== email.toLowerCase()) {
        throw new InviteAcceptError(403, "Invite email mismatch");
      }

      const ws = await tx.workspace.findUnique({
        where: { id: inv.workspaceId },
        select: { billingPlan: true },
      });
      const limit = seatLimitForPlan(ws?.billingPlan ?? "FREE");

      const user = await tx.user.upsert({
        where: { email },
        create: { email, credits: 3, billingPlan: "FREE" },
        update: {},
        select: { id: true, activeWorkspaceId: true },
      });

      const existingMembership = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } },
        select: { id: true },
      });

      if (!existingMembership) {
        const memberCount = await tx.workspaceMember.count({ where: { workspaceId: inv.workspaceId } });
        if (memberCount >= limit) {
          throw new InviteAcceptError(400, "Workspace is at seat capacity");
        }
      }

      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } },
        create: { workspaceId: inv.workspaceId, userId: user.id, role: inv.role },
        update: { role: inv.role },
      });

      await tx.workspaceInvite.update({ where: { id: inv.id }, data: { status: "ACCEPTED" } });

      if (!user.activeWorkspaceId) {
        await tx.user.update({ where: { id: user.id }, data: { activeWorkspaceId: inv.workspaceId } });
      }

      return inv.workspaceId;
    });

    return NextResponse.json({ ok: true, workspaceId });
  } catch (e) {
    if (e instanceof InviteAcceptError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Accept failed" }, { status: 500 });
  }
}
