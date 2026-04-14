import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminShell from "@/components/admin/AdminShell";
import prisma from "@/lib/prisma";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const userId = (session.user as { id?: string }).id;
  let demoWorkspace = false;
  if (userId) {
    const u = await prisma.user
      .findUnique({ where: { id: userId }, select: { activeWorkspaceId: true } })
      .catch(() => null);
    if (u?.activeWorkspaceId) {
      const w = await prisma.workspace
        .findUnique({ where: { id: u.activeWorkspaceId }, select: { demoWorkspaceEnabled: true } })
        .catch(() => null);
      demoWorkspace = Boolean(w?.demoWorkspaceEnabled);
    }
  }

  return <AdminShell demoWorkspace={demoWorkspace}>{children}</AdminShell>;
}
