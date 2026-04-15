import prisma from "@/src/lib/prisma";
import { SAVED_BOARD_FILTER_ALERT_LOG_DELEGATE_KEY, updateManySavedBoardFilterAlertLogs } from "@/lib/saved-board-filter-alert-log";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function resolveFallbackWorkspaceId(): Promise<string | null> {
  const ws = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }).catch(() => null);
  return ws?.id ?? null;
}

async function workspaceForUserId(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { activeWorkspaceId: true } }).catch(() => null);
  return u?.activeWorkspaceId ?? null;
}

async function backfillByUser(
  model: "productEvent",
  batch: number,
  fallbackWorkspaceId: string,
): Promise<number> {
  const rows = await prisma.productEvent.findMany({
    where: { workspaceId: null, userId: { not: null } },
    select: { id: true, userId: true },
    take: batch,
    orderBy: { createdAt: "asc" },
  });
  let updated = 0;
  for (const r of rows) {
    const uid = r.userId;
    if (!uid) continue;
    const ws = (await workspaceForUserId(uid)) ?? fallbackWorkspaceId;
    const res = await prisma.productEvent.updateMany({ where: { id: r.id, workspaceId: null }, data: { workspaceId: ws } });
    updated += res.count;
  }
  return updated;
}

export async function tenantBackfillJob(): Promise<{
  fallbackWorkspaceId: string | null;
  updated: Record<string, number>;
}> {
  const batch = intFromEnv("TENANT_BACKFILL_BATCH", 200);
  const fallbackWorkspaceId = await resolveFallbackWorkspaceId();
  if (!fallbackWorkspaceId) return { fallbackWorkspaceId: null, updated: {} };

  const updated: Record<string, number> = {};
  const bump = (k: string, n: number) => (updated[k] = (updated[k] ?? 0) + n);

  // Tables without userId: assign to fallback workspace.
  bump("watchlist", await prisma.watchlist.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));
  bump("watchlistRun", await prisma.watchlistRun.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));
  bump("watchlistAlertLog", await prisma.watchlistAlertLog.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));
  bump("savedBoardFilter", await prisma.savedBoardFilter.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));
  bump("savedBoardFilterRun", await prisma.savedBoardFilterRun.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));
  bump(
    SAVED_BOARD_FILTER_ALERT_LOG_DELEGATE_KEY,
    await updateManySavedBoardFilterAlertLogs({
      where: { workspaceId: null },
      data: { workspaceId: fallbackWorkspaceId },
      take: batch,
    } as never).then((r) => r.count).catch(() => 0)
  );
  bump("report", await prisma.report.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));
  bump("reviewQueueItem", await prisma.reviewQueueItem.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));

  // Lead/GTM: assign to fallback if missing.
  bump("lead", await prisma.lead.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));
  bump("gtmLead", await prisma.gtmLead.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));
  bump("gtmActivity", await prisma.gtmActivity.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: batch } as any).then(r => r.count).catch(() => 0));

  // Product events: prefer owner's active workspace when userId exists.
  bump("productEvent_byUser", await backfillByUser("productEvent", Math.max(1, Math.floor(batch / 2)), fallbackWorkspaceId).catch(() => 0));
  bump("productEvent_fallback", await prisma.productEvent.updateMany({ where: { workspaceId: null }, data: { workspaceId: fallbackWorkspaceId }, take: Math.max(1, Math.floor(batch / 2)) } as any).then(r => r.count).catch(() => 0));

  return { fallbackWorkspaceId, updated };
}

