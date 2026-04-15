import type { Session } from "next-auth";
import { Prisma } from "@prisma/client";
import { ProductEventType, type ProductEventTypeValue } from "@/lib/analytics/product-event-types";
import { prisma } from "@/lib/prisma";

export type TrackProductEventInput = {
  eventType: ProductEventTypeValue;
  userId?: string | null;
  workspaceId?: string | null;
  sessionId?: string | null;
  path?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

function sessionUserId(session: Session | null): string | undefined {
  const u = session?.user as { id?: string } | undefined;
  return u?.id && u.id.length > 0 ? u.id : undefined;
}

async function resolveWorkspaceIdForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeWorkspaceId: true },
  });
  return user?.activeWorkspaceId ?? null;
}

/**
 * Best-effort insert; never throws to callers.
 */
export async function trackProductEvent(input: TrackProductEventInput): Promise<void> {
  try {
    await prisma.productEvent.create({
      data: {
        eventType: input.eventType,
        userId: input.userId ?? undefined,
        workspaceId: input.workspaceId ?? undefined,
        sessionId: input.sessionId ?? undefined,
        path: input.path ?? undefined,
        entityType: input.entityType ?? undefined,
        entityId: input.entityId ?? undefined,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (e) {
    console.warn("[product-analytics] trackProductEvent failed", e);
  }
}

export async function trackProductEventFromSession(
  session: Session | null,
  input: Omit<TrackProductEventInput, "userId" | "workspaceId">,
): Promise<void> {
  const userId = sessionUserId(session);
  let workspaceId: string | null = null;
  if (userId) {
    workspaceId = await resolveWorkspaceIdForUser(userId);
  }
  await trackProductEvent({
    ...input,
    userId: userId ?? null,
    workspaceId,
  });
}

export async function trackPaywallHitFromSession(
  session: Session | null,
  feature: string,
  path?: string | null,
): Promise<void> {
  await trackProductEventFromSession(session, {
    eventType: ProductEventType.PAYWALL_HIT,
    path: path ?? undefined,
    metadata: { feature },
  });
}

export type ProductAnalyticsOverview = {
  activeUsers7d: number;
  topBoards: { boardKey: string; count: number }[];
  reportExports7d: number;
  paywallHits7d: number;
  paywallByFeature: { feature: string; count: number }[];
  topAutoActions: { actionType: string; count: number }[];
  topPaths: { path: string; count: number }[];
  leadsCreated7d: number;
  compareRuns7d: number;
  reportCreates7d: number;
  watchlistCreates7d: number;
  checkoutStarts7d: number;
  portalOpens7d: number;
  funnel: {
    login: number;
    dashboardView: number;
    firstSource: number;
    firstWatchlist: number;
    firstCompare: number;
    firstReport: number;
  };
};

function countByMetadataKey(
  rows: { metadata: Prisma.JsonValue | null }[],
  key: string,
  fallback = "unknown",
): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const meta = r.metadata as Record<string, unknown> | null;
    const v =
      meta && typeof meta[key] === "string" && (meta[key] as string).length > 0
        ? (meta[key] as string)
        : fallback;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getProductAnalyticsOverview(workspaceId?: string | null): Promise<ProductAnalyticsOverview> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ws = workspaceId ?? null;
  const wsSql7 = ws ? Prisma.sql` AND "workspaceId" = ${ws}` : Prisma.empty;
  const wsSql30 = ws ? Prisma.sql` AND "workspaceId" = ${ws}` : Prisma.empty;

  const [
    activeUsersRaw,
    boardRows,
    reportExports7d,
    paywallHits7d,
    paywallRows,
    autoRows,
    pathRows,
    leadsCreated7d,
    compareRuns7d,
    reportCreates7d,
    watchlistCreates7d,
    checkoutStarts7d,
    portalOpens7d,
    funnelLogin,
    funnelDash,
    funnelSource,
    funnelWl,
    funnelCompare,
    funnelReport,
  ] = await Promise.all([
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "ProductEvent"
      WHERE "userId" IS NOT NULL AND "createdAt" >= ${d7} ${wsSql7}
    `,
    prisma.productEvent.findMany({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.BOARD_VIEW, createdAt: { gte: d7 } },
      select: { metadata: true },
      take: 8000,
    }),
    prisma.productEvent.count({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.REPORT_EXPORT, createdAt: { gte: d7 } },
    }),
    prisma.productEvent.count({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.PAYWALL_HIT, createdAt: { gte: d7 } },
    }),
    prisma.productEvent.findMany({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.PAYWALL_HIT, createdAt: { gte: d7 } },
      select: { metadata: true },
      take: 8000,
    }),
    prisma.productEvent.findMany({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.AUTO_ACTION_RUN, createdAt: { gte: d7 } },
      select: { metadata: true },
      take: 8000,
    }),
    prisma.$queryRaw<{ path: string; count: bigint }[]>`
      SELECT COALESCE(NULLIF(TRIM("path"), ''), '(no path)') AS path, COUNT(*)::bigint AS count
      FROM "ProductEvent"
      WHERE "createdAt" >= ${d7} AND "path" IS NOT NULL ${wsSql7}
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 20
    `,
    prisma.productEvent.count({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.LEAD_CREATE, createdAt: { gte: d7 } },
    }),
    prisma.productEvent.count({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.COMPARE_RUN, createdAt: { gte: d7 } },
    }),
    prisma.productEvent.count({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.REPORT_CREATE, createdAt: { gte: d7 } },
    }),
    prisma.productEvent.count({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.WATCHLIST_CREATE, createdAt: { gte: d7 } },
    }),
    prisma.productEvent.count({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.BILLING_CHECKOUT_START, createdAt: { gte: d7 } },
    }),
    prisma.productEvent.count({
      where: { ...(ws ? { workspaceId: ws } : {}), eventType: ProductEventType.BILLING_PORTAL_OPEN, createdAt: { gte: d7 } },
    }),
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "ProductEvent"
      WHERE "eventType" = 'LOGIN_SUCCESS' AND "userId" IS NOT NULL AND "createdAt" >= ${d30} ${wsSql30}
    `,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "ProductEvent"
      WHERE "eventType" = 'DASHBOARD_VIEW' AND "userId" IS NOT NULL AND "createdAt" >= ${d30} ${wsSql30}
    `,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "ProductEvent"
      WHERE "eventType" = 'SOURCE_CREATED' AND "userId" IS NOT NULL AND "createdAt" >= ${d30} ${wsSql30}
    `,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "ProductEvent"
      WHERE "eventType" = 'WATCHLIST_CREATE' AND "userId" IS NOT NULL AND "createdAt" >= ${d30} ${wsSql30}
    `,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "ProductEvent"
      WHERE "eventType" = 'COMPARE_RUN' AND "userId" IS NOT NULL AND "createdAt" >= ${d30} ${wsSql30}
    `,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT "userId")::bigint AS n FROM "ProductEvent"
      WHERE "eventType" = 'REPORT_CREATE' AND "userId" IS NOT NULL AND "createdAt" >= ${d30} ${wsSql30}
    `,
  ]);

  const topBoards = countByMetadataKey(boardRows, "boardKey").map((x) => ({
    boardKey: x.key,
    count: x.count,
  }));
  const paywallByFeature = countByMetadataKey(paywallRows, "feature").map((x) => ({
    feature: x.key,
    count: x.count,
  }));
  const topAutoActions = countByMetadataKey(autoRows, "actionType").map((x) => ({
    actionType: x.key,
    count: x.count,
  }));

  return {
    activeUsers7d: Number(activeUsersRaw[0]?.n ?? BigInt(0)),
    topBoards,
    reportExports7d,
    paywallHits7d,
    paywallByFeature,
    topAutoActions,
    topPaths: pathRows.map((r) => ({ path: r.path, count: Number(r.count) })),
    leadsCreated7d,
    compareRuns7d,
    reportCreates7d,
    watchlistCreates7d,
    checkoutStarts7d,
    portalOpens7d,
    funnel: {
      login: Number(funnelLogin[0]?.n ?? BigInt(0)),
      dashboardView: Number(funnelDash[0]?.n ?? BigInt(0)),
      firstSource: Number(funnelSource[0]?.n ?? BigInt(0)),
      firstWatchlist: Number(funnelWl[0]?.n ?? BigInt(0)),
      firstCompare: Number(funnelCompare[0]?.n ?? BigInt(0)),
      firstReport: Number(funnelReport[0]?.n ?? BigInt(0)),
    },
  };
}
