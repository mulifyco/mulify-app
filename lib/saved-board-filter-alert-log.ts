import prisma from "@/lib/prisma";

/** Delegate name differs across generate/schema revisions — resolve at runtime, access only via bracket notation (no direct `prisma.<delegate>` in call sites). */
type AlertLogDelegate = {
  findMany: (args?: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
  findFirst: (args?: unknown) => Promise<unknown>;
  create: (args?: unknown) => Promise<unknown>;
  updateMany: (args?: unknown) => Promise<{ count: number }>;
};

function getAlertLogDelegate(client: unknown): AlertLogDelegate {
  const r = client as Record<string, AlertLogDelegate | undefined>;
  const d = r["savedBoardFilterAlertLog"] ?? r["boardAlertLog"];
  if (!d?.findMany || !d?.count || !d?.findFirst || !d?.create || !d?.updateMany) {
    throw new Error("Missing board saved-filter alert log delegate on Prisma client (expected savedBoardFilterAlertLog or boardAlertLog).");
  }
  return d;
}

export const SAVED_BOARD_FILTER_ALERT_LOG_DELEGATE_KEY: string = (() => {
  const r = prisma as unknown as Record<string, { findMany?: unknown } | undefined>;
  if (r["savedBoardFilterAlertLog"]?.findMany != null) return "savedBoardFilterAlertLog";
  if (r["boardAlertLog"]?.findMany != null) return "boardAlertLog";
  return "savedBoardFilterAlertLog";
})();

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

/** Row shape for default list args (delegate resolved dynamically, so we pin the UI shape here). */
export type SavedBoardFilterAlertLogRow = {
  id: string;
  workspaceId: string | null;
  savedFilterId: string;
  boardType: string;
  title: string;
  message: string;
  severity: string;
  matchedCount: number;
  deltaCount: number;
  metadata: unknown;
  createdAt: Date;
  savedFilter: { id: string; name: string } | null;
};

export function getSavedBoardFilterAlertLogRows(): Promise<SavedBoardFilterAlertLogRow[]> {
  return getAlertLogDelegate(prisma).findMany(
    savedBoardFilterAlertLogDefaultFindManyArgs
  ) as Promise<SavedBoardFilterAlertLogRow[]>;
}

export async function loadSavedBoardFilterAlertLogPage(opts: { skip: number; take: number }): Promise<{
  rows: SavedBoardFilterAlertLogRow[];
  total: number;
}> {
  const d = getAlertLogDelegate(prisma);
  const [rows, total] = await Promise.all([
    d.findMany({
      ...savedBoardFilterAlertLogDefaultFindManyArgs,
      orderBy: { createdAt: "desc" },
      skip: opts.skip,
      take: opts.take,
    }) as Promise<SavedBoardFilterAlertLogRow[]>,
    d.count(),
  ]);
  return { rows, total };
}

export function countSavedBoardFilterAlertLogs(where: unknown): Promise<number> {
  return getAlertLogDelegate(prisma).count(where);
}

export function findManySavedBoardFilterAlertLogs(args: unknown): Promise<unknown> {
  return getAlertLogDelegate(prisma).findMany(args);
}

export function findFirstSavedBoardFilterAlertLogOnTx(tx: unknown, args: unknown): Promise<unknown> {
  return getAlertLogDelegate(tx).findFirst(args);
}

export function createSavedBoardFilterAlertLogOnTx(tx: unknown, args: unknown): Promise<unknown> {
  return getAlertLogDelegate(tx).create(args);
}

export function updateManySavedBoardFilterAlertLogs(whereData: unknown): Promise<{ count: number }> {
  return getAlertLogDelegate(prisma).updateMany(whereData);
}
