import prisma from "@/lib/prisma";

export const boardAlertFindManyArgs = {
  include: {
    savedFilter: {
      select: {
        id: true,
        name: true,
      },
    },
  },
} as const;

export function getBoardAlerts() {
  return prisma.boardAlertLog.findMany(boardAlertFindManyArgs);
}

export async function loadBoardAlertsPage(opts: { skip: number; take: number }) {
  const [rows, total] = await Promise.all([
    prisma.boardAlertLog.findMany({
      ...boardAlertFindManyArgs,
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.take,
    }),
    prisma.boardAlertLog.count(),
  ]);
  return { rows, total };
}
