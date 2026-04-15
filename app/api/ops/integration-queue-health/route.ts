import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { sweepStuckIntegrationSyncRuns } from "@/server/services/integrations/stuck-integration-sync-run-sweep.service";
import { isOpsAdmin } from "@/server/authz/admin-scope";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOpsAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Best-effort: keep health endpoint self-healing.
  await sweepStuckIntegrationSyncRuns().catch(() => 0);

  const now = Date.now();
  const [pendingCount, runningCount, failedRecentCount, oldestPending, lastWorkerTick, lastIntegrationJobTick] =
    await Promise.all([
      prisma.integrationSyncRun.count({ where: { status: "PENDING" } }).catch(() => 0),
      prisma.integrationSyncRun.count({ where: { status: "RUNNING" } }).catch(() => 0),
      prisma.integrationSyncRun
        .count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } })
        .catch(() => 0),
      prisma.integrationSyncRun
        .findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, select: { createdAt: true } })
        .catch(() => null),
      prisma.scraperJob
        .findFirst({ where: { type: "worker_tick", status: "SUCCESS" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true, startedAt: true } })
        .catch(() => null),
      prisma.scraperJob
        .findFirst({ where: { type: "integration_sync_runs", status: "SUCCESS" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true, startedAt: true, payload: true } })
        .catch(() => null),
    ]);

  const oldestPendingAgeMs = oldestPending ? now - oldestPending.createdAt.getTime() : null;

  return jsonWithReadCache({
    pendingCount,
    runningCount,
    failedRecentCount1h: failedRecentCount,
    oldestPendingAgeMs,
    lastWorkerTickAt: lastWorkerTick?.finishedAt?.toISOString() ?? lastWorkerTick?.startedAt?.toISOString() ?? null,
    lastIntegrationSyncTickAt:
      lastIntegrationJobTick?.finishedAt?.toISOString() ??
      lastIntegrationJobTick?.startedAt?.toISOString() ??
      null,
    lastIntegrationSyncTickPayload: lastIntegrationJobTick?.payload ?? null,
  });
}

