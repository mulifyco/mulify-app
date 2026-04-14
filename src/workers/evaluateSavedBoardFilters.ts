import prisma from "@/src/lib/prisma";
import { evaluateAndPersistSavedBoardFilter } from "@/server/services/saved-board-filter-evaluation.service";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function logWorker(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  // Keep best-effort, no throw.
  try {
    await prisma.syncLog.create({
      data: {
        sourceId: "saved_filters",
        jobId: null,
        level,
        message,
        data: (data as never) ?? null,
      },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Scheduled evaluation phase for SavedBoardFilter rules.
 * - never throws fatally (worker tick should continue)
 * - batch-limited via SAVED_FILTER_EVAL_BATCH
 */
export async function evaluateSavedBoardFiltersJob(): Promise<{
  filtersScanned: number;
  filtersEvaluated: number;
  alertsTriggered: number;
  failed: number;
}> {
  const batch = intFromEnv("SAVED_FILTER_EVAL_BATCH", 10);

  const filters = await prisma.savedBoardFilter.findMany({
    where: { isEnabled: true },
    orderBy: [{ lastEvaluatedAt: "asc" }, { updatedAt: "desc" }],
    take: batch,
    select: { id: true, workspaceId: true, name: true, boardType: true, lastMatchedCount: true, lastEvaluatedAt: true },
  });

  let filtersEvaluated = 0;
  let alertsTriggered = 0;
  let failed = 0;

  for (const f of filters) {
    if (!f.workspaceId) continue;
    try {
      const res = await evaluateAndPersistSavedBoardFilter({ workspaceId: f.workspaceId, savedFilterId: f.id });
      filtersEvaluated += 1;
      if (res.triggeredAlert) alertsTriggered += 1;
    } catch (e) {
      failed += 1;
      await logWorker("warn", "saved_filter_evaluation_failed", {
        filterId: f.id,
        filterName: f.name,
        boardType: f.boardType,
        workspaceId: f.workspaceId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await logWorker("info", "saved_filter_evaluation_tick", {
    batch,
    filtersScanned: filters.length,
    filtersEvaluated,
    alertsTriggered,
    failed,
  });

  return { filtersScanned: filters.length, filtersEvaluated, alertsTriggered, failed };
}

