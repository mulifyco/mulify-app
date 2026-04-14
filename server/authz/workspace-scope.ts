import type { Session } from "next-auth";
import prisma from "@/lib/prisma";

export type RequiredWorkspaceContext = {
  userId: string;
  workspaceId: string;
};

function sessionUserId(session: Session | null): string | null {
  const u = session?.user as { id?: string } | undefined;
  return typeof u?.id === "string" && u.id.trim() ? u.id.trim() : null;
}

export async function getRequiredWorkspace(session: Session | null): Promise<RequiredWorkspaceContext> {
  const userId = sessionUserId(session);
  if (!userId) throw new Error("Unauthorized");

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeWorkspaceId: true },
  });
  const workspaceId = u?.activeWorkspaceId ?? null;
  if (!workspaceId) throw new Error("No active workspace");

  return { userId, workspaceId };
}

export function assertWorkspaceAccess(recordWorkspaceId: string | null | undefined, currentWorkspaceId: string): void {
  if (!recordWorkspaceId) throw new Error("Workspace missing on record");
  if (recordWorkspaceId !== currentWorkspaceId) throw new Error("Forbidden");
}

export function withWorkspaceWhere<T extends Record<string, unknown>>(where: T | undefined, workspaceId: string): T {
  const base = (where ?? {}) as Record<string, unknown>;
  return ({ ...(base as object), workspaceId } as unknown) as T;
}

export function withOptionalWorkspaceWhere<T extends Record<string, unknown>>(
  where: T | undefined,
  workspaceId: string | null,
): T {
  const base = (where ?? {}) as Record<string, unknown>;
  if (!workspaceId) return base as T;
  return ({ ...(base as object), workspaceId } as unknown) as T;
}

