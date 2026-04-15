import prisma from "@/lib/prisma";
import { msFromEnv } from "@/lib/sources/reliability";
import { logIntegrationEvent } from "@/server/logging/integrations";
import { STALE_INTEGRATION_RUN_ERROR, integrationRunStaleCutoff } from "./stuck-integration-sync-run-helpers";

/**
 * Marks integration sync runs stuck in RUNNING past threshold as FAILED.
 *
 * This prevents runs from staying RUNNING forever if worker crashes mid-execution.
 */
export async function sweepStuckIntegrationSyncRuns(): Promise<number> {
  const thresholdMs = msFromEnv("INTEGRATION_SYNC_RUN_STUCK_MS", 15 * 60 * 1000);
  const now = new Date();
  const cutoff = integrationRunStaleCutoff(now, thresholdMs);

  const stuck = await prisma.integrationSyncRun.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: cutoff },
      completedAt: null,
    },
    select: { id: true, workspaceId: true, connectionId: true, startedAt: true },
    take: 200,
  });

  for (const r of stuck) {
    const durationMs = r.startedAt ? now.getTime() - r.startedAt.getTime() : thresholdMs;
    await prisma.integrationSyncRun.update({
      where: { id: r.id },
      data: {
        status: "FAILED",
        completedAt: now,
        durationMs,
        error: STALE_INTEGRATION_RUN_ERROR,
        metadata: { errorCode: "WORKER_INTERRUPTED", sweptAt: now.toISOString() },
      } as any,
    });

    logIntegrationEvent({
      workspaceId: r.workspaceId,
      provider: "FACEBOOK",
      action: "SYNC",
      result: "error",
      errorCode: "STUCK_RUN_SWEPT",
      message: "marked_failed_stale_running",
      meta: { runId: r.id, connectionId: r.connectionId, startedAt: r.startedAt?.toISOString() ?? null, cutoff: cutoff.toISOString() },
    });
  }

  return stuck.length;
}

