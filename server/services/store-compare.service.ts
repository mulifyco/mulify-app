import prisma from "@/lib/prisma";
import { normalizeShopifyDomain } from "@/lib/url";
import { canonicalStoreDomainForEntity } from "@/lib/intelligence/entity-identity";
import { ProductClusterRepository } from "@/server/repositories/product-cluster.repository";
import { CreativeClusterRepository } from "@/server/repositories/creative-cluster.repository";
import { batchStoreTimelineHints } from "@/server/services/historical-delta.service";

export type StoreCompareInput = { domains?: string[]; storeIds?: string[] };

export type StoreCompareRow = {
  domain: string;
  storeId: string | null;
  shopId: string | null;
  name: string | null;
  lastSeenAt: Date | null;
  trendScore: number;
  totalProducts: number;
  totalCollections: number;
  linkedProductClusterCount: number;
  linkedCreativeClusterCount: number;
  avgReadyToScaleScore: number | null;
  avgMarketLeaderScore: number | null;
  avgEarlyMoverScore: number | null;
  avgSaturatedScore: number | null;
  readyToScaleCount: number;
  earlyMoverCount: number;
  saturatedCount: number;
  topProductClusters: any[];
  topCreativeClusters: any[];
  missingReason?: string;
  timeline7d?: {
    deltaTraffic: number | null;
    deltaProductClusters: number | null;
    deltaCreativeClusters: number | null;
    momentum: "up" | "down" | "flat" | "unknown";
  };
};

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

async function clusterAveragesForStore(storeId: string) {
  const ids = await prisma.productClusterMember
    .findMany({ where: { storeId }, select: { clusterId: true }, take: 1500 })
    .then((rows) => uniq(rows.map((r) => r.clusterId)))
    .catch(() => []);
  if (!ids.length) {
    return {
      avgReadyToScaleScore: null,
      avgMarketLeaderScore: null,
      avgEarlyMoverScore: null,
      avgSaturatedScore: null,
      readyToScaleCount: 0,
      earlyMoverCount: 0,
      saturatedCount: 0,
      linkedProductClusterCount: 0,
    };
  }

  const clusters = await prisma.productCluster.findMany({
    where: { id: { in: ids.slice(0, 400) } },
    select: {
      readyToScaleScore: true,
      marketLeaderScore: true,
      earlyMoverScore: true,
      saturatedScore: true,
    },
    take: 400,
  });

  const avg = (values: number[]) =>
    values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;

  const rtsVals = clusters.map((c) => Number(c.readyToScaleScore ?? 0)).filter((n) => Number.isFinite(n));
  const mlVals = clusters.map((c) => Number(c.marketLeaderScore ?? 0)).filter((n) => Number.isFinite(n));
  const emVals = clusters.map((c) => Number(c.earlyMoverScore ?? 0)).filter((n) => Number.isFinite(n));
  const satVals = clusters.map((c) => Number(c.saturatedScore ?? 0)).filter((n) => Number.isFinite(n));

  const readyToScaleCount = clusters.filter((c) => (c.readyToScaleScore ?? 0) > 0).length;
  const earlyMoverCount = clusters.filter((c) => (c.earlyMoverScore ?? 0) > 0).length;
  const saturatedCount = clusters.filter((c) => (c.saturatedScore ?? 0) > 0).length;

  return {
    avgReadyToScaleScore: avg(rtsVals),
    avgMarketLeaderScore: avg(mlVals),
    avgEarlyMoverScore: avg(emVals),
    avgSaturatedScore: avg(satVals),
    readyToScaleCount,
    earlyMoverCount,
    saturatedCount,
    linkedProductClusterCount: ids.length,
  };
}

async function creativeClusterCountForDomain(domain: string): Promise<{ shopId: string | null; count: number }> {
  const canon = canonicalStoreDomainForEntity(domain) || domain;
  const shop =
    (await prisma.shop.findUnique({ where: { domain: canon }, select: { id: true } })) ??
    (canon !== domain ? await prisma.shop.findUnique({ where: { domain }, select: { id: true } }) : null);
  if (!shop) return { shopId: null, count: 0 };
  const rows = await prisma.creativeClusterMember
    .findMany({ where: { shopId: shop.id }, select: { clusterId: true }, take: 2000 })
    .then((r) => uniq(r.map((x) => x.clusterId)).length)
    .catch(() => 0);
  return { shopId: shop.id, count: rows };
}

export async function compareStores(input: StoreCompareInput): Promise<{
  requested: { domains: string[]; storeIds: string[] };
  stores: StoreCompareRow[];
  aggregates: {
    avgTrend: number;
    avgSaturation: number | null;
    latestSeenAt: Date | null;
  };
  missing: Array<{ key: string; reason: string }>;
}> {
  const domainsRaw = uniq((input.domains ?? []).map((d) => normalizeShopifyDomain(d)).filter(Boolean));
  const canonicalFromInput = [...new Set(domainsRaw.map((d) => canonicalStoreDomainForEntity(d) || d))];
  const domainQuery = uniq([...domainsRaw, ...canonicalFromInput]);
  const storeIds = uniq((input.storeIds ?? []).filter(Boolean));

  const storesById = storeIds.length
    ? await prisma.store.findMany({
        where: { id: { in: storeIds } },
        include: { _count: { select: { products: true, collections: true } } },
      })
    : [];

  const storesByDomain = domainQuery.length
    ? await prisma.store.findMany({
        where: { domain: { in: domainQuery } },
        include: { _count: { select: { products: true, collections: true } } },
      })
    : [];

  const mergedById = new Map<string, (typeof storesById)[0]>();
  for (const s of [...storesById, ...storesByDomain]) {
    if (!mergedById.has(s.id)) mergedById.set(s.id, s);
  }
  const combined = [...mergedById.values()];

  const byCanon = new Map<string, (typeof combined)[0]>();
  for (const s of combined) {
    const canon = canonicalStoreDomainForEntity(s.domain) || s.domain;
    const existing = byCanon.get(canon);
    if (!existing) {
      byCanon.set(canon, s);
      continue;
    }
    const a = existing;
    const b = s;
    const prefer =
      b._count.products !== a._count.products
        ? b._count.products > a._count.products
          ? b
          : a
        : (b.lastSeenAt?.getTime() ?? 0) >= (a.lastSeenAt?.getTime() ?? 0)
          ? b
          : a;
    byCanon.set(canon, prefer);
  }
  const storeRows = [...byCanon.values()];

  const missing: Array<{ key: string; reason: string }> = [];
  for (const d of domainsRaw) {
    const canon = canonicalStoreDomainForEntity(d) || d;
    const hit = storeRows.some((s) => s.domain === d || canonicalStoreDomainForEntity(s.domain) === canon);
    if (!hit) missing.push({ key: d, reason: "Store not found for domain" });
  }
  for (const id of storeIds) {
    if (!storeRows.find((s) => s.id === id)) missing.push({ key: id, reason: "Store not found for storeId" });
  }

  const shopRows = domainQuery.length
    ? await prisma.shop.findMany({
        where: { domain: { in: domainQuery } },
        select: { domain: true, trendScore: true, id: true },
      })
    : [];
  const trendByDomain = new Map<string, { score: number; id: string }>();
  for (const s of shopRows) {
    trendByDomain.set(s.domain, { score: s.trendScore ?? 0, id: s.id });
    const c = canonicalStoreDomainForEntity(s.domain);
    if (c && c !== s.domain) trendByDomain.set(c, { score: s.trendScore ?? 0, id: s.id });
  }

  const perStore = await Promise.all(
    storeRows.map(async (s) => {
      const canonD = canonicalStoreDomainForEntity(s.domain) || s.domain;
      const trend = trendByDomain.get(s.domain)?.score ?? trendByDomain.get(canonD)?.score ?? 0;
      const creativeCount = await creativeClusterCountForDomain(canonD);
      const avg = await clusterAveragesForStore(s.id);
      const [topProductClusters, topCreativeClusters] = await Promise.all([
        ProductClusterRepository.listForStore(s.id, 6).catch(() => []),
        CreativeClusterRepository.listForStoreDomain(s.domain, 6).catch(() => []),
      ]);

      const row: StoreCompareRow = {
        domain: s.domain,
        storeId: s.id,
        shopId: creativeCount.shopId,
        name: s.name ?? null,
        lastSeenAt: s.lastSeenAt ?? null,
        trendScore: trend,
        totalProducts: s._count.products,
        totalCollections: s._count.collections,
        linkedProductClusterCount: avg.linkedProductClusterCount,
        linkedCreativeClusterCount: creativeCount.count,
        avgReadyToScaleScore: avg.avgReadyToScaleScore,
        avgMarketLeaderScore: avg.avgMarketLeaderScore,
        avgEarlyMoverScore: avg.avgEarlyMoverScore,
        avgSaturatedScore: avg.avgSaturatedScore,
        readyToScaleCount: avg.readyToScaleCount,
        earlyMoverCount: avg.earlyMoverCount,
        saturatedCount: avg.saturatedCount,
        topProductClusters,
        topCreativeClusters,
      };
      return row;
    })
  );

  const hints = await batchStoreTimelineHints(
    perStore.map((s) => s.storeId).filter((id): id is string => Boolean(id)),
    7
  );
  for (const row of perStore) {
    if (row.storeId) {
      const h = hints.get(row.storeId);
      if (h) row.timeline7d = h;
    }
  }

  const avgTrend =
    perStore.length > 0 ? Math.round((perStore.reduce((a, b) => a + (b.trendScore ?? 0), 0) / perStore.length) * 10) / 10 : 0;
  const latestSeenAt =
    perStore.length > 0
      ? perStore
          .map((s) => s.lastSeenAt)
          .filter((d): d is Date => Boolean(d))
          .reduce((a, b) => (b > a ? b : a), perStore[0]?.lastSeenAt ?? new Date(0))
      : null;

  return {
    requested: { domains: domainsRaw, storeIds },
    stores: perStore,
    aggregates: {
      avgTrend,
      avgSaturation: null,
      latestSeenAt: latestSeenAt && latestSeenAt.getTime() > 0 ? latestSeenAt : null,
    },
    missing,
  };
}

