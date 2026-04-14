import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, activeWorkspaceId: true },
  });
  if (!user) return NextResponse.json({ data: [], activeWorkspaceId: null });

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: { select: { id: true, name: true, billingPlan: true, demoWorkspaceEnabled: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    data: memberships.map((m) => ({
      workspaceId: m.workspaceId,
      name: m.workspace.name,
      billingPlan: m.workspace.billingPlan,
      role: m.role,
      demo: Boolean(m.workspace.demoWorkspaceEnabled),
    })),
    activeWorkspaceId: user.activeWorkspaceId,
  });
}

