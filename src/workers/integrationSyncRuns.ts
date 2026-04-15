import prisma from "@/src/lib/prisma";
import { runFacebookIntegrationSyncRun } from "@/server/services/integrations/facebook-sync-runner";

export async function integrationSyncRunsJob(): Promise<{
  pendingFound: number;
  attempted: number;
  completed: number;
  failed: number;
  skipped: number;
}> {
  const maxPerTick = Number.parseInt(process.env.INTEGRATION_SYNC_MAX_PER_TICK ?? "3", 10) || 3;

  const pending = await prisma.integrationSyncRun.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(25, maxPerTick)),
    select: { id: true, connectionId: true, workspaceId: true },
  });

  let attempted = 0;
  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const p of pending) {
    attempted += 1;
    // Currently only Facebook is implemented.
    const conn = await prisma.integrationConnection
      .findUnique({ where: { id: p.connectionId }, select: { provider: true } })
      .catch(() => null);
    if (!conn) {
      skipped += 1;
      continue;
    }
    if (conn.provider !== "FACEBOOK") {
      skipped += 1;
      continue;
    }

    const res = await runFacebookIntegrationSyncRun(p.id);
    if (res.ok === false) {
      skipped += 1;
      continue;
    }
    if (res.status === "COMPLETED") completed += 1;
    else failed += 1;
  }

  return {
    pendingFound: pending.length,
    attempted,
    completed,
    failed,
    skipped,
  };
}

