import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as any;
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId.trim() : "";
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } }).catch(() => null);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const membership = await prisma.workspaceMember
    .findUnique({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, select: { id: true } })
    .catch(() => null);
  if (!membership) return NextResponse.json({ error: "Not a member of workspace" }, { status: 403 });

  await prisma.user.update({ where: { id: user.id }, data: { activeWorkspaceId: workspaceId } });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

