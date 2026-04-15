import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";

/** PrismaClient delegate key for `SavedBoardFilterAlertLog` — compile-time checked against generated client. */
export const SAVED_BOARD_FILTER_ALERT_LOG_DELEGATE_KEY = "savedBoardFilterAlertLog" satisfies keyof PrismaClient;

export const savedBoardFilterAlertLogDefaultFindManyArgs = {
  include: {
    savedFilter: {
      select: {
        id: true,
        name: true,
      },
    },
  },
} as const;

export function getSavedBoardFilterAlertLogRows() {
  return prisma.savedBoardFilterAlertLog.findMany(savedBoardFilterAlertLogDefaultFindManyArgs);
}

export async function loadSavedBoardFilterAlertLogPage(opts: { skip: number; take: number }) {
  const [rows, total] = await Promise.all([
    prisma.savedBoardFilterAlertLog.findMany({
      ...savedBoardFilterAlertLogDefaultFindManyArgs,
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.savedBoardFilterAlertLog.count(),
  ]);
  return { rows, total };
}
