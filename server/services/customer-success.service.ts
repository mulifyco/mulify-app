import type { CustomerDigest, CustomerHealthSnapshot, CustomerNudge, CustomerNudgeStatus } from "@prisma/client";
import { CustomerDigestType, ProductEventType } from "@prisma/client";
import prisma from "@/lib/prisma";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export type WeeklyDigestSummary = {
  periodStart: string;
  periodEnd: string;
  topBoardWins: Array<{ title: string; score: number }>;
  newEarlyMovers: Array<{ title: string; score: number }>;
  watchlistSpikes7d: number;
  alertsTriggered7d: number;
  reportsCreated7d: number;
  newLeads7d: number;
  health: { score: number; label: "GREAT" | "OK" | "RISK" };
};

export type HealthScoreBreakdown = {
  score: number; // 0-100
  lastActiveAt: Date | null;
  components: {
    recency: number;
    boards: number;
    compare: number;
    reports: number;
    watchlists: number;
    alerts: number;
    savedFilters: number;
  };
  stats: {
    activeBoards: number;
    savedFiltersCount: number;
    watchlistsCount: number;
    alertsTriggered7d: number;
    reportsCreated7d: number;
    compareRuns7d: number;
  };
};

async function resolveWorkspaceIdForUser(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { activeWorkspaceId: true } });
  return u?.activeWorkspaceId ?? null;
}

function countByMetadataKey(rows: { metadata: unknown }[], key: string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const meta = (r.metadata ?? null) as Record<string, unknown> | null;
    const v = meta && typeof meta[key] === "string" ? (meta[key] as string) : "unknown";
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

export async function computeCustomerHealth(params: {
  userId: string;
  workspaceId?: string | null;
}): Promise<HealthScoreBreakdown> {
  const userId = params.userId;
  const workspaceId = params.workspaceId ?? (await resolveWorkspaceIdForUser(userId));
  if (!workspaceId) throw new Error("No active workspace.");

  const d7 = daysAgo(7);

  const [lastEvent, boardViews, compareRuns7d, reportCreates7d, watchlistsCount, savedFiltersCount, alerts7d] =
    await Promise.all([
      prisma.productEvent.findFirst({
        where: { userId, workspaceId, createdAt: { gte: daysAgo(45) } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.productEvent.findMany({
        where: { userId, workspaceId, eventType: ProductEventType.BOARD_VIEW, createdAt: { gte: d7 } },
        select: { metadata: true },
        take: 4000,
      }),
      prisma.productEvent.count({
        where: { userId, workspaceId, eventType: ProductEventType.COMPARE_RUN, createdAt: { gte: d7 } },
      }),
      prisma.productEvent.count({
        where: { userId, workspaceId, eventType: ProductEventType.REPORT_CREATE, createdAt: { gte: d7 } },
      }),
      prisma.watchlist.count({ where: { workspaceId } }),
      prisma.savedBoardFilter.count({ where: { workspaceId } }),
      Promise.all([
        prisma.watchlistAlertLog.count({ where: { workspaceId, createdAt: { gte: d7 } } }),
        prisma.boardAlertLog.count({ where: { workspaceId, createdAt: { gte: d7 } } }),
      ]).then(([a, b]) => a + b),
    ]);

  const activeBoards = countByMetadataKey(boardViews, "boardKey").filter((x) => x.key !== "unknown").length;
  const lastActiveAt = lastEvent?.createdAt ?? null;

  // 0-100 score with a simple, explainable breakdown (product-led retention baseline).
  const recencyDays = lastActiveAt ? (Date.now() - lastActiveAt.getTime()) / (24 * 60 * 60 * 1000) : 999;
  const recency =
    recencyDays <= 1 ? 25 : recencyDays <= 3 ? 18 : recencyDays <= 7 ? 12 : recencyDays <= 14 ? 6 : 0;
  const boards = Math.min(15, activeBoards * 5);
  const compare = Math.min(10, compareRuns7d * 2);
  const reports = Math.min(15, reportCreates7d * 5);
  const watchlists = watchlistsCount > 0 ? 10 : 0;
  const savedFilters = savedFiltersCount > 0 ? 10 : 0;
  const alerts = Math.min(15, alerts7d >= 1 ? 10 + Math.min(5, Math.floor(alerts7d / 3)) : 0);

  const score = Math.max(0, Math.min(100, Math.round(recency + boards + compare + reports + watchlists + alerts + savedFilters)));

  return {
    score,
    lastActiveAt,
    components: { recency, boards, compare, reports, watchlists, alerts, savedFilters },
    stats: {
      activeBoards,
      savedFiltersCount,
      watchlistsCount,
      alertsTriggered7d: alerts7d,
      reportsCreated7d: reportCreates7d,
      compareRuns7d,
    },
  };
}

export async function upsertCustomerHealthSnapshot(params: {
  userId: string;
  workspaceId?: string | null;
}): Promise<CustomerHealthSnapshot> {
  const workspaceId = params.workspaceId ?? (await resolveWorkspaceIdForUser(params.userId));
  if (!workspaceId) throw new Error("No active workspace.");

  const h = await computeCustomerHealth({ userId: params.userId, workspaceId });

  return prisma.customerHealthSnapshot.create({
    data: {
      userId: params.userId,
      workspaceId,
      activeBoards: h.stats.activeBoards,
      savedFiltersCount: h.stats.savedFiltersCount,
      watchlistsCount: h.stats.watchlistsCount,
      alertsTriggered7d: h.stats.alertsTriggered7d,
      reportsCreated7d: h.stats.reportsCreated7d,
      lastActiveAt: h.lastActiveAt,
      healthScore: h.score,
    },
  });
}

export async function ensureWeeklyDigest(params: {
  userId: string;
  workspaceId?: string | null;
  now?: Date;
}): Promise<CustomerDigest> {
  const userId = params.userId;
  const workspaceId = params.workspaceId ?? (await resolveWorkspaceIdForUser(userId));
  if (!workspaceId) throw new Error("No active workspace.");

  const now = params.now ?? new Date();
  const periodEnd = startOfUtcDay(now);
  const periodStart = startOfUtcDay(daysAgo(7));

  const existing = await prisma.customerDigest.findFirst({
    where: { userId, workspaceId, type: CustomerDigestType.WEEKLY, periodStart, periodEnd },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const d7 = periodStart;
  const [health, wins, earlyMovers, watchlistSpikes7d, alertsTriggered7d, reportsCreated7d, newLeads7d] =
    await Promise.all([
      computeCustomerHealth({ userId, workspaceId }),
      prisma.productCluster.findMany({
        where: { updatedAt: { gte: d7 } },
        select: { title: true, winningScore: true },
        orderBy: [{ winningScore: "desc" }, { updatedAt: "desc" }],
        take: 6,
      }),
      prisma.productCluster.findMany({
        where: { updatedAt: { gte: d7 }, earlyMoverScore: { gte: 70 } },
        select: { title: true, earlyMoverScore: true },
        orderBy: [{ earlyMoverScore: "desc" }, { updatedAt: "desc" }],
        take: 6,
      }),
      prisma.watchlistRun.count({ where: { workspaceId, createdAt: { gte: d7 } } }),
      Promise.all([
        prisma.watchlistAlertLog.count({ where: { workspaceId, createdAt: { gte: d7 } } }),
        prisma.boardAlertLog.count({ where: { workspaceId, createdAt: { gte: d7 } } }),
      ]).then(([a, b]) => a + b),
      prisma.productEvent.count({ where: { userId, workspaceId, eventType: ProductEventType.REPORT_CREATE, createdAt: { gte: d7 } } }),
      prisma.productEvent.count({ where: { userId, workspaceId, eventType: ProductEventType.LEAD_CREATE, createdAt: { gte: d7 } } }),
    ]);

  const label: WeeklyDigestSummary["health"]["label"] = health.score >= 75 ? "GREAT" : health.score >= 45 ? "OK" : "RISK";
  const summary: WeeklyDigestSummary = {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    topBoardWins: wins.map((w) => ({ title: w.title ?? "Untitled", score: Number(w.winningScore ?? 0) })),
    newEarlyMovers: earlyMovers.map((w) => ({ title: w.title ?? "Untitled", score: Number(w.earlyMoverScore ?? 0) })),
    watchlistSpikes7d,
    alertsTriggered7d,
    reportsCreated7d,
    newLeads7d,
    health: { score: health.score, label },
  };

  return prisma.customerDigest.create({
    data: {
      userId,
      workspaceId,
      periodStart,
      periodEnd,
      type: CustomerDigestType.WEEKLY,
      summary: summary as any,
    },
  });
}

type NudgeInput = {
  userId: string;
  workspaceId: string;
  type: string;
  title: string;
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
};

async function createNudgeOncePerWindow(params: NudgeInput & { since: Date }): Promise<CustomerNudge | null> {
  const existing = await prisma.customerNudge.findFirst({
    where: { userId: params.userId, workspaceId: params.workspaceId, type: params.type, createdAt: { gte: params.since } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) return null;

  return prisma.customerNudge.create({
    data: {
      userId: params.userId,
      workspaceId: params.workspaceId,
      type: params.type,
      title: params.title,
      message: params.message,
      ctaLabel: params.ctaLabel ?? null,
      ctaUrl: params.ctaUrl ?? null,
      status: "OPEN",
    },
  });
}

export async function generateCustomerNudges(params: {
  userId: string;
  workspaceId?: string | null;
}): Promise<{ created: number }> {
  const userId = params.userId;
  const workspaceId = params.workspaceId ?? (await resolveWorkspaceIdForUser(userId));
  if (!workspaceId) throw new Error("No active workspace.");

  const d7 = daysAgo(7);
  const d30 = daysAgo(30);

  const [health, watchlistsCount, savedFiltersCount, reports7d, compare7d, alerts7d, userRow] = await Promise.all([
    computeCustomerHealth({ userId, workspaceId }),
    prisma.watchlist.count({ where: { workspaceId } }),
    prisma.savedBoardFilter.count({ where: { workspaceId } }),
    prisma.productEvent.count({ where: { userId, workspaceId, eventType: ProductEventType.REPORT_CREATE, createdAt: { gte: d7 } } }),
    prisma.productEvent.count({ where: { userId, workspaceId, eventType: ProductEventType.COMPARE_RUN, createdAt: { gte: d7 } } }),
    Promise.all([
      prisma.watchlistAlertLog.count({ where: { workspaceId, createdAt: { gte: d7 } } }),
      prisma.boardAlertLog.count({ where: { workspaceId, createdAt: { gte: d7 } } }),
    ]).then(([a, b]) => a + b),
    prisma.user.findUnique({ where: { id: userId }, select: { billingPlan: true } }),
  ]);

  const nudges: Array<Promise<CustomerNudge | null>> = [];

  if (watchlistsCount === 0) {
    nudges.push(
      createNudgeOncePerWindow({
        userId,
        workspaceId,
        type: "NO_WATCHLIST_YET",
        title: "Create your first watchlist",
        message: "Watchlists turn Mulify into a weekly habit—track competitors and get spikes automatically.",
        ctaLabel: "Create watchlist",
        ctaUrl: "/watchlists",
        since: d30,
      }),
    );
  }

  if (savedFiltersCount === 0) {
    nudges.push(
      createNudgeOncePerWindow({
        userId,
        workspaceId,
        type: "SAVED_FILTERS_EMPTY",
        title: "Save a board filter",
        message: "Saved filters help you come back to the same winning criteria without re-tuning sliders every time.",
        ctaLabel: "Open boards",
        ctaUrl: "/boards",
        since: d30,
      }),
    );
  }

  if (reports7d === 0) {
    nudges.push(
      createNudgeOncePerWindow({
        userId,
        workspaceId,
        type: "NO_REPORT_CREATED_YET",
        title: "Generate a report for your best find",
        message: "Reports capture evidence + next steps so you can share or revisit later.",
        ctaLabel: "Open reports",
        ctaUrl: "/reports",
        since: d7,
      }),
    );
  }

  if (compare7d === 0) {
    nudges.push(
      createNudgeOncePerWindow({
        userId,
        workspaceId,
        type: "NO_COMPARE_THIS_WEEK",
        title: "Run a quick compare",
        message: "Comparing 1–3 domains is the fastest way to see what’s changing and why it matters.",
        ctaLabel: "Open compare",
        ctaUrl: "/compare",
        since: d7,
      }),
    );
  }

  if (alerts7d > 0) {
    nudges.push(
      createNudgeOncePerWindow({
        userId,
        workspaceId,
        type: "NEW_ALERTS_AVAILABLE",
        title: "New alerts are available",
        message: "You have new spikes/alerts in the last 7 days. Reviewing them keeps you ahead of competitors.",
        ctaLabel: "Open watchlists",
        ctaUrl: "/watchlists",
        since: d7,
      }),
    );
  }

  const hasRecentEarlyMover = await prisma.productCluster.count({ where: { updatedAt: { gte: d7 }, earlyMoverScore: { gte: 80 } } });
  if (hasRecentEarlyMover > 0) {
    nudges.push(
      createNudgeOncePerWindow({
        userId,
        workspaceId,
        type: "NEW_EARLY_MOVER_DETECTED",
        title: "New early movers detected",
        message: "A new early-mover signal appeared recently. It may be a narrow window—check the Early Movers board.",
        ctaLabel: "Open Early Movers",
        ctaUrl: "/boards?boardType=EARLY_MOVERS",
        since: d7,
      }),
    );
  }

  if (health.score <= 40 && (userRow?.billingPlan === "PRO" || userRow?.billingPlan === "TEAM")) {
    nudges.push(
      createNudgeOncePerWindow({
        userId,
        workspaceId,
        type: "CHURN_RISK_LOW_USAGE",
        title: "Usage looks low for a paid workspace",
        message: "This is a placeholder churn-risk signal. Consider creating a watchlist + one report to lock in value weekly.",
        ctaLabel: "Open dashboard",
        ctaUrl: "/dashboard",
        since: d7,
      }),
    );
  }

  const created = (await Promise.all(nudges)).filter(Boolean).length;
  return { created };
}

export async function listCustomerNudges(params: {
  userId: string;
  workspaceId?: string | null;
  status?: CustomerNudgeStatus | null;
  take?: number;
}): Promise<CustomerNudge[]> {
  const workspaceId = params.workspaceId ?? (await resolveWorkspaceIdForUser(params.userId));
  if (!workspaceId) throw new Error("No active workspace.");
  return prisma.customerNudge.findMany({
    where: {
      userId: params.userId,
      workspaceId,
      status: params.status ?? "OPEN",
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(50, params.take ?? 12)),
  });
}

export async function updateNudgeStatus(params: {
  userId: string;
  nudgeId: string;
  status: CustomerNudgeStatus;
}): Promise<CustomerNudge> {
  const row = await prisma.customerNudge.findUnique({ where: { id: params.nudgeId } });
  if (!row || row.userId !== params.userId) throw new Error("Not found");
  return prisma.customerNudge.update({ where: { id: params.nudgeId }, data: { status: params.status } });
}

export async function getLatestCustomerDigest(params: {
  userId: string;
  workspaceId?: string | null;
}): Promise<CustomerDigest | null> {
  const workspaceId = params.workspaceId ?? (await resolveWorkspaceIdForUser(params.userId));
  if (!workspaceId) return null;
  return prisma.customerDigest.findFirst({
    where: { userId: params.userId, workspaceId, type: CustomerDigestType.WEEKLY },
    orderBy: { createdAt: "desc" },
  });
}

export async function getLatestHealthSnapshot(params: {
  userId: string;
  workspaceId?: string | null;
}): Promise<CustomerHealthSnapshot | null> {
  const workspaceId = params.workspaceId ?? (await resolveWorkspaceIdForUser(params.userId));
  if (!workspaceId) return null;
  return prisma.customerHealthSnapshot.findFirst({
    where: { userId: params.userId, workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

