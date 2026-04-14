import prisma from "@/src/lib/prisma";
import { evaluateWatchlistAndPersist } from "@/server/services/watchlist-evaluation.service";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function logWorker(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  try {
    await prisma.syncLog.create({
      data: {
        sourceId: "watchlists",
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

export async function evaluateWatchlistsJob(): Promise<{
  watchlistsScanned: number;
  watchlistsEvaluated: number;
  alertsWritten: number;
  failed: number;
}> {
  const batch = intFromEnv("WATCHLIST_EVAL_BATCH", 10);

  const watchlists = await prisma.watchlist.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: batch,
    select: { id: true, name: true },
  });

  let watchlistsEvaluated = 0;
  let alertsWritten = 0;
  let failed = 0;

  for (const wl of watchlists) {
    try {
      const res = await evaluateWatchlistAndPersist({ watchlistId: wl.id, triggeredBy: "worker" });
      watchlistsEvaluated += 1;
      alertsWritten += res.alertsWritten;
    } catch (e) {
      failed += 1;
      await logWorker("warn", "watchlist_evaluation_failed", {
        watchlistId: wl.id,
        watchlistName: wl.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await logWorker("info", "watchlist_evaluation_tick", {
    batch,
    watchlistsScanned: watchlists.length,
    watchlistsEvaluated,
    alertsWritten,
    failed,
  });

  return { watchlistsScanned: watchlists.length, watchlistsEvaluated, alertsWritten, failed };
}

