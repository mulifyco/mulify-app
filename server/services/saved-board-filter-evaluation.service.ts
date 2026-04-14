import type { BoardType, Platform, SavedBoardFilter } from "@prisma/client";
import { ReadyToScaleBoardRepository } from "@/server/repositories/ready-to-scale-board.repository";
import { MarketLeadersBoardRepository } from "@/server/repositories/market-leaders-board.repository";
import { EarlyMoversBoardRepository } from "@/server/repositories/early-movers-board.repository";
import { SaturatedProductsBoardRepository } from "@/server/repositories/saturated-products-board.repository";
import { CreativeWinnersBoardRepository } from "@/server/repositories/creative-winners-board.repository";
import { SavedBoardFilterRepository } from "@/server/repositories/saved-board-filter.repository";
import prisma from "@/lib/prisma";

/** Best-effort pool size for matching (alerts will use dedicated queries later). */
const EVAL_POOL = Number.parseInt(process.env.SAVED_BOARD_FILTER_EVAL_POOL ?? "2500", 10) || 2500;

function passesStoreAndSaturation(
  filter: Pick<SavedBoardFilter, "minStores" | "maxSaturation">,
  row: { storeCount: number; saturationScore: number }
): boolean {
  if (filter.minStores != null && row.storeCount < filter.minStores) return false;
  if (filter.maxSaturation != null && row.saturationScore > filter.maxSaturation) return false;
  return true;
}

/**
 * Count rows matching saved criteria (repository minScore + optional store/saturation/platform).
 * Does not persist; use {@link evaluateAndPersistSavedBoardFilter} for that.
 */
export async function countMatchesForSavedBoardFilter(filter: SavedBoardFilter): Promise<number> {
  const minScore = filter.minScore ?? 0;

  switch (filter.boardType as BoardType) {
    case "READY_TO_SCALE": {
      const rows = await ReadyToScaleBoardRepository.list({ take: EVAL_POOL, minScore });
      return rows.filter((r) => passesStoreAndSaturation(filter, r)).length;
    }
    case "MARKET_LEADERS": {
      const rows = await MarketLeadersBoardRepository.list({ take: EVAL_POOL, minScore });
      return rows.filter((r) => passesStoreAndSaturation(filter, r)).length;
    }
    case "EARLY_MOVERS": {
      const rows = await EarlyMoversBoardRepository.list({ take: EVAL_POOL, minScore });
      return rows.filter((r) => passesStoreAndSaturation(filter, r)).length;
    }
    case "SATURATED_PRODUCTS": {
      const rows = await SaturatedProductsBoardRepository.list({ take: EVAL_POOL, minScore });
      return rows.filter((r) => passesStoreAndSaturation(filter, r)).length;
    }
    case "CREATIVE_WINNERS": {
      const rows = await CreativeWinnersBoardRepository.list({ take: EVAL_POOL, minScore });
      return rows.filter((r) => {
        if (!passesStoreAndSaturation(filter, r)) return false;
        if (filter.platform != null && r.platform !== (filter.platform as Platform)) return false;
        return true;
      }).length;
    }
    default:
      return 0;
  }
}

/** Run evaluation and write lastMatchedCount + lastEvaluatedAt (for scheduling / future alerts). */
export async function evaluateAndPersistSavedBoardFilter(params: {
  workspaceId: string;
  savedFilterId: string;
}): Promise<{ matchedCount: number; triggeredAlert: boolean }> {
  const id = params.savedFilterId;
  const workspaceId = params.workspaceId;
  const filter = await SavedBoardFilterRepository.findById(workspaceId, id);
  if (!filter) throw new Error("Saved filter not found");

  const previousMatchedCount = filter.lastMatchedCount ?? 0;
  let matchedCount = 0;
  try {
    matchedCount = await countMatchesForSavedBoardFilter(filter);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.savedBoardFilterRun.create({
      data: {
        workspaceId,
        savedFilterId: filter.id,
        matchedCount: 0,
        previousMatchedCount,
        deltaCount: -previousMatchedCount,
        status: "FAILED",
        triggeredAlert: false,
        summary: `Evaluation failed: ${msg}`.slice(0, 500),
      },
    });
    throw e;
  }
  const now = new Date();
  const deltaCount = matchedCount - previousMatchedCount;

  const newMatches = matchedCount > 0 && previousMatchedCount === 0;
  const deltaBig = deltaCount >= 3;
  const pctIncrease =
    previousMatchedCount > 0 ? (matchedCount - previousMatchedCount) / previousMatchedCount : matchedCount > 0 ? 999 : 0;
  const pctBig = previousMatchedCount > 0 && pctIncrease >= 0.5 && deltaCount > 0;

  // Basic dedupe: do not write the same alert for the same filter too frequently.
  const dedupeWindowMin = Number.parseInt(process.env.BOARD_ALERT_DEDUPE_MIN ?? "30", 10) || 30;
  const dedupeAfter = new Date(Date.now() - dedupeWindowMin * 60 * 1000);

  let triggeredAlert = false;

  await prisma.$transaction(async (tx) => {
    await SavedBoardFilterRepository.update(workspaceId, id, {
      lastMatchedCount: matchedCount,
      lastEvaluatedAt: now,
    });

    await tx.savedBoardFilterRun.create({
      data: {
        workspaceId,
        savedFilterId: filter.id,
        matchedCount,
        previousMatchedCount,
        deltaCount,
        status: "COMPLETED",
        triggeredAlert: false,
        summary: `matched:${matchedCount} prev:${previousMatchedCount} delta:${deltaCount}`,
      },
    });

    const rules: Array<{ key: string; title: string; message: string; severity: "INFO" | "WARNING" | "HIGH" }> = [];

    if (newMatches) {
      rules.push({
        key: "new_matches",
        title: "Saved filter started matching",
        message: `"${filter.name}" now matches ${matchedCount} items (was 0).`,
        severity: "HIGH",
      });
    }
    if (deltaBig) {
      rules.push({
        key: "delta_ge_3",
        title: "Saved filter match spike",
        message: `"${filter.name}" increased by ${deltaCount} (now ${matchedCount}).`,
        severity: deltaCount >= 10 ? "HIGH" : "WARNING",
      });
    }
    if (pctBig) {
      const pct = Math.round(pctIncrease * 100);
      rules.push({
        key: "pct_50",
        title: "Saved filter growth ≥ 50%",
        message: `"${filter.name}" grew +${pct}% (Δ ${deltaCount}, now ${matchedCount}).`,
        severity: "WARNING",
      });
    }

    for (const r of rules) {
      const existing = await tx.boardAlertLog.findFirst({
        where: {
          workspaceId,
          savedFilterId: filter.id,
          createdAt: { gte: dedupeAfter },
          metadata: { path: ["ruleKey"], equals: r.key } as never,
        },
        select: { id: true },
      });
      if (existing) continue;

      await tx.boardAlertLog.create({
        data: {
          workspaceId,
          savedFilterId: filter.id,
          boardType: filter.boardType,
          title: r.title,
          message: r.message,
          severity: r.severity,
          matchedCount,
          deltaCount,
          metadata: {
            ruleKey: r.key,
            dedupeWindowMin,
            previousMatchedCount,
          } as never,
        },
      });
      triggeredAlert = true;
    }

    if (triggeredAlert) {
      // Mark most recent run row (created above) as alerting (best-effort, no heavy lookup).
      const lastRun = await tx.savedBoardFilterRun.findFirst({
        where: { savedFilterId: filter.id, workspaceId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (lastRun) {
        await tx.savedBoardFilterRun.update({
          where: { id: lastRun.id },
          data: { triggeredAlert: true },
        });
      }
    }
  });

  return { matchedCount, triggeredAlert };
}
