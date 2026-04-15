import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";
import prisma from "@/lib/prisma";
import { logIntegrationEvent } from "@/server/logging/integrations";
import { buildFacebookStatus } from "@/server/integrations/facebook-status";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const row = await prisma.integrationConnection.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "FACEBOOK" } },
    select: {
      id: true,
      provider: true,
      status: true,
      encryptedConfig: true,
      publicConfig: true,
      lastSyncedAt: true,
      lastError: true,
    },
  });

  const syncInProgress = row
    ? await prisma.integrationSyncRun
        .findFirst({
          where: { connectionId: row.id, status: "RUNNING" },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        })
        .then((r) => Boolean(r))
        .catch(() => false)
    : false;

  const latestRun = row
    ? await prisma.integrationSyncRun
        .findFirst({
          where: { connectionId: row.id },
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, startedAt: true, completedAt: true },
        })
        .catch(() => null)
    : null;

  const payload = buildFacebookStatus({ row: row as any, syncInProgress, latestRun: latestRun as any });
  logIntegrationEvent({
    workspaceId,
    provider: "FACEBOOK",
    action: "STATUS",
    result: "ok",
    message: String(payload.status),
    meta: { hasCredentials: payload.hasCredentials, syncInProgress: payload.syncInProgress },
  });

  return NextResponse.json(payload);
}

