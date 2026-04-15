import type { Watchlist, WatchlistStore } from "@prisma/client";
import prisma from "@/lib/prisma";
import { watchlistDb } from "@/lib/prisma-watchlist-delegate";
import { normalizeShopifyDomain } from "@/lib/url";

export type WatchlistWithStores = Watchlist & { stores: WatchlistStore[] };

/** Row shape for paginated list (matches `list` include). */
export type WatchlistRow = Watchlist & { _count: { stores: number } };

export const WatchlistRepository = {
  async list(options: { workspaceId: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.max(1, Math.min(200, options?.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      watchlistDb().findMany({
        where: { workspaceId: options.workspaceId },
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          _count: { select: { stores: true } },
        },
      }) as Promise<WatchlistRow[]>,
      watchlistDb().count({ where: { workspaceId: options.workspaceId } }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async create(input: { workspaceId: string; name: string; description?: string | null }): Promise<Watchlist> {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");
    return watchlistDb().create({
      data: { workspaceId: input.workspaceId, name, description: input.description?.trim() || null },
    }) as Promise<Watchlist>;
  },

  async update(workspaceId: string, id: string, patch: { name?: string | null; description?: string | null }): Promise<Watchlist> {
    const existing = await watchlistDb().findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) throw new Error("Not found");
    return watchlistDb().update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name?.trim() || "Untitled" } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      },
    }) as Promise<Watchlist>;
  },

  async delete(workspaceId: string, id: string): Promise<Watchlist> {
    const existing = await watchlistDb().findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) throw new Error("Not found");
    return watchlistDb().delete({ where: { id } }) as Promise<Watchlist>;
  },

  async findById(workspaceId: string, id: string): Promise<WatchlistWithStores | null> {
    return watchlistDb().findFirst({
      where: { id, workspaceId },
      include: { stores: { orderBy: { createdAt: "desc" } } },
    }) as Promise<WatchlistWithStores | null>;
  },

  async addDomain(workspaceId: string, watchlistId: string, params: { domain: string; label?: string | null }) {
    const domain = normalizeShopifyDomain(params.domain);
    if (!domain) throw new Error("domain is required");
    const wl = await watchlistDb().findFirst({ where: { id: watchlistId, workspaceId }, select: { id: true } });
    if (!wl) throw new Error("Not found");

    const [store, source] = await Promise.all([
      prisma.store.findUnique({ where: { domain }, select: { id: true } }).catch(() => null),
      prisma.source.findFirst({ where: { type: "SHOPIFY_DOMAIN" as any, domain } as any, select: { id: true } }).catch(
        () => null
      ),
    ]);

    return prisma.watchlistStore.upsert({
      where: { watchlistId_domain: { watchlistId, domain } },
      create: {
        watchlistId,
        domain,
        label: params.label?.trim() || null,
        storeId: store?.id ?? null,
        sourceId: source?.id ?? null,
      },
      update: {
        label: params.label?.trim() || undefined,
        storeId: store?.id ?? undefined,
        sourceId: source?.id ?? undefined,
      },
    });
  },

  async removeItem(workspaceId: string, watchlistId: string, itemId: string) {
    const wl = await watchlistDb().findFirst({ where: { id: watchlistId, workspaceId }, select: { id: true } });
    if (!wl) throw new Error("Not found");
    const row = await prisma.watchlistStore.findFirst({ where: { id: itemId, watchlistId }, select: { id: true } });
    if (!row) throw new Error("Not found");
    return prisma.watchlistStore.delete({ where: { id: row.id } });
  },

  async summary(workspaceId: string, watchlistId: string) {
    const wl = (await watchlistDb().findFirst({
      where: { id: watchlistId, workspaceId },
      include: { stores: true },
    })) as WatchlistWithStores | null;
    if (!wl) return null;

    const domains = wl.stores.map((s) => s.domain);
    const [stores, shops] = await Promise.all([
      prisma.store.findMany({ where: { domain: { in: domains } }, select: { id: true, domain: true, lastSeenAt: true } }),
      prisma.shop.findMany({ where: { domain: { in: domains } }, select: { id: true, trendScore: true } }),
    ]);
    const storeIds = stores.map((s) => s.id);
    const shopIds = shops.map((s) => s.id);

    const [productClusters, creativeClusters] = await Promise.all([
      storeIds.length
        ? prisma.productClusterMember
            .findMany({ where: { storeId: { in: storeIds } }, select: { clusterId: true }, take: 2000 })
            .then((rows) => new Set(rows.map((r) => r.clusterId)).size)
            .catch(() => 0)
        : 0,
      shopIds.length
        ? prisma.creativeClusterMember
            .findMany({ where: { shopId: { in: shopIds } }, select: { clusterId: true }, take: 2500 })
            .then((rows) => new Set(rows.map((r) => r.clusterId)).size)
            .catch(() => 0)
        : 0,
    ]);

    const avgTrend =
      shops.length > 0 ? shops.reduce((a, b) => a + (b.trendScore ?? 0), 0) / Math.max(1, shops.length) : 0;
    const latestSeen = stores.length ? stores.reduce((a, b) => (b.lastSeenAt > a ? b.lastSeenAt : a), stores[0]!.lastSeenAt) : null;

    return {
      watchlistId: wl.id,
      totalStores: wl.stores.length,
      totalLinkedProductClusters: productClusters,
      totalLinkedCreativeClusters: creativeClusters,
      avgTrendScore: Math.round(avgTrend * 10) / 10,
      avgSaturation: null as number | null, // future: derive from product/creative scores
      latestSeenAt: latestSeen,
    };
  },

  async compare(workspaceId: string, watchlistId: string) {
    const wl = (await watchlistDb().findFirst({
      where: { id: watchlistId, workspaceId },
      include: { stores: true },
    })) as WatchlistWithStores | null;
    if (!wl) return null;

    const domains = wl.stores.map((s) => s.domain);
    const [stores, shops] = await Promise.all([
      prisma.store.findMany({
        where: { domain: { in: domains } },
        select: {
          id: true,
          domain: true,
          name: true,
          lastSeenAt: true,
          trafficScore: true,
          winningProbabilityScore: true,
          opportunityLevel: true,
        },
      }),
      prisma.shop.findMany({ where: { domain: { in: domains } }, select: { id: true, domain: true, trendScore: true } }),
    ]);

    const storeIds = stores.map((s) => s.id);
    const shopIds = shops.map((s) => s.id);

    const topProductClusters = storeIds.length
      ? prisma.productCluster.findMany({
          where: { members: { some: { storeId: { in: storeIds } } } },
          orderBy: [{ winningScore: "desc" }, { lastSeenAt: "desc" }],
          take: 12,
        })
      : Promise.resolve([]);

    const topCreativeClusters = shopIds.length
      ? prisma.creativeCluster.findMany({
          where: { members: { some: { shopId: { in: shopIds } } } },
          orderBy: [{ scaleScore: "desc" }, { lastSeenAt: "desc" }],
          take: 12,
        })
      : Promise.resolve([]);

    const readyToScale = storeIds.length
      ? prisma.productCluster.findMany({
          where: { members: { some: { storeId: { in: storeIds } } } },
          orderBy: [{ readyToScaleScore: "desc" }, { lastSeenAt: "desc" }],
          take: 10,
        })
      : Promise.resolve([]);

    const earlyMovers = storeIds.length
      ? prisma.productCluster.findMany({
          where: { members: { some: { storeId: { in: storeIds } } } },
          orderBy: [{ earlyMoverScore: "desc" }, { lastSeenAt: "desc" }],
          take: 10,
        })
      : Promise.resolve([]);

    const saturated = storeIds.length
      ? prisma.productCluster.findMany({
          where: { members: { some: { storeId: { in: storeIds } } } },
          orderBy: [{ saturatedScore: "desc" }, { lastSeenAt: "desc" }],
          take: 10,
        })
      : Promise.resolve([]);

    const [pc, cc, rts, em, sat] = await Promise.all([
      topProductClusters,
      topCreativeClusters,
      readyToScale,
      earlyMovers,
      saturated,
    ]);

    const trendByDomain = new Map(shops.map((s) => [s.domain, s.trendScore]));
    const storesSummary = stores.map((s) => ({
      ...s,
      trendScore: trendByDomain.get(s.domain) ?? 0,
    }));

    return {
      watchlist: { id: wl.id, name: wl.name },
      stores: storesSummary,
      topProductClusters: pc,
      topCreativeClusters: cc,
      topReadyToScale: rts,
      topEarlyMovers: em,
      topSaturated: sat,
      linkedSignals: {
        note: "Best-effort: product/creative clusters filtered by watchlist store domains.",
      },
    };
  },
};

