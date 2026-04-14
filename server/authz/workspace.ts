import prisma from "@/lib/prisma";

export type WorkspaceRole = "OWNER" | "ADMIN" | "ANALYST" | "VIEWER";

export async function getActiveWorkspaceForEmail(email: string) {
  const u = await prisma.user.findUnique({
    where: { email },
    select: { id: true, activeWorkspaceId: true },
  });
  return u?.activeWorkspaceId ? { userId: u.id, workspaceId: u.activeWorkspaceId } : null;
}

export async function getWorkspaceRole(params: { workspaceId: string; userId: string }): Promise<WorkspaceRole | null> {
  const m = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: params.workspaceId, userId: params.userId } },
    select: { role: true },
  });
  return (m?.role as WorkspaceRole) ?? null;
}

/** @deprecated Prefer granular helpers below; kept for backwards compatibility. */
export function canManageTeam(role: WorkspaceRole | null) {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageBilling(role: WorkspaceRole | null) {
  return role === "OWNER";
}

/** Create or revoke invites (billing-adjacent team growth). */
export function canManageInvites(role: WorkspaceRole | null) {
  return role === "OWNER";
}

/** Change roles / remove members (not billing). */
export function canManageWorkspaceMembers(role: WorkspaceRole | null) {
  return role === "OWNER" || role === "ADMIN";
}

/** Team roster + product usage (read-heavy settings). */
export function canViewWorkspaceTeam(role: WorkspaceRole | null) {
  return role === "OWNER" || role === "ADMIN" || role === "ANALYST" || role === "VIEWER";
}

/** Pending invites list (read) — owners and admins. */
export function canViewInvites(role: WorkspaceRole | null) {
  return role === "OWNER" || role === "ADMIN";
}

/** Intelligence features — blocked for pure viewers where enforced. */
export function canUseProductFeatures(role: WorkspaceRole | null) {
  return role === "OWNER" || role === "ADMIN" || role === "ANALYST";
}

export function isWorkspaceRole(v: string): v is WorkspaceRole {
  return v === "OWNER" || v === "ADMIN" || v === "ANALYST" || v === "VIEWER";
}

/** ADMIN must not mutate OWNER membership rows or assign OWNER. */
export function canAdminActOnMember(actor: WorkspaceRole | null, targetMemberRole: WorkspaceRole): boolean {
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return targetMemberRole !== "OWNER";
  return false;
}

export function canAssignMemberRole(actor: WorkspaceRole | null, nextRole: WorkspaceRole): boolean {
  if (actor === "OWNER") return true;
  if (actor === "ADMIN") return nextRole !== "OWNER";
  return false;
}

