import prisma from "@/lib/prisma";
import { canonicalDiscoveryStoreDomain } from "@/lib/intelligence/discovery-coverage";

export type DiscoveryScoringContext = {
  boardDomains: Set<string>;
  trendingDomains: Set<string>;
  creativeWinnerDomains: Set<string>;
  risingClusterDomains: Set<string>;
  watchlistDomains: Set<string>;
  watchlistSpikeDomains: Set<string>;
  compareRivalDomains: Set<string>;
  newProducts24hDomains: Set<string>;
  offerDenseDomains: Set<string>;
};

function addCanon(set: Set<string>, raw: string | null | undefined) {
  if (!raw?.trim()) return;
  const d = canonicalDiscoveryStoreDomain(raw.trim());
  if (d) set.add(d);
}

/**
 * Preload domain sets for discovery score bonuses (boards, trending, creatives, history, watchlists).
 * Best-effort: failures yield empty sets.
 */
export async function loadDiscoveryScoringContext(): Promise<DiscoveryScoringContext> {
  const boardDomains = new Set<string>();
  const trendingDomains = new Set<string>();
  const creativeWinnerDomains = new Set<string>();
  const risingClusterDomains = new Set<string>();
  const watchlistDomains = new Set<string>();
  const watchlistSpikeDomains = new Set<string>();
  const compareRivalDomains = new Set<string>();
  const newProducts24hDomains = new Set<string>();
  const offerDenseDomains = new Set<string>();

  const sevenDays = new Date(Date.now() - 7 * 86400000);
  const thirtyDays = new Date(Date.now() - 30 * 86400000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const clusters = await prisma.productCluster.findMany({
      where: {
        OR: [
          { readyToScaleScore: { gte: 12 } },
          { marketLeaderScore: { gte: 12 } },
          { earlyMoverScore: { gte: 12 } },
          { winningScore: { gte: 22 } },
        ],
      },
      take: 220,
      select: {
        members: {
          take: 40,
          select: { product: { select: { store: { select: { domain: true } } } } },
        },
      },
    });
    for (const c of clusters) {
      for (const m of c.members) {
        addCanon(boardDomains, m.product?.store?.domain);
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const products = await prisma.product.findMany({
      where: { lastSeenAt: { gte: sevenDays } },
      orderBy: [{ trafficScore: "desc" }, { lastSeenAt: "desc" }],
      take: 200,
      select: { store: { select: { domain: true } } },
    });
    for (const p of products) {
      addCanon(trendingDomains, p.store?.domain);
    }
  } catch {
    /* ignore */
  }

  try {
    const members = await prisma.creativeClusterMember.findMany({
      where: { cluster: { creativeWinnerScore: { gte: 18 } } },
      take: 350,
      select: {
        ad: {
          select: {
            destinationUrl: true,
            canonicalUrl: true,
            shop: { select: { domain: true } },
          },
        },
      },
    });
    for (const m of members) {
      const a = m.ad;
      if (!a) continue;
      addCanon(creativeWinnerDomains, a.shop?.domain);
      addCanon(creativeWinnerDomains, a.destinationUrl);
      addCanon(creativeWinnerDomains, a.canonicalUrl);
    }
  } catch {
    /* ignore */
  }

  try {
    const snaps = await prisma.productClusterSnapshot.findMany({
      where: {
        snapshotDate: { gte: thirtyDays },
        OR: [{ deltaReadyToScale: { gte: 2 } }, { deltaStoreCount: { gte: 1 } }, { deltaWinningScore: { gte: 4 } }],
      },
      take: 400,
      select: { productClusterId: true },
    });
    const ids = [...new Set(snaps.map((s) => s.productClusterId))];
    if (ids.length) {
      const pMembers = await prisma.productClusterMember.findMany({
        where: { clusterId: { in: ids.slice(0, 200) } },
        take: 600,
        select: { product: { select: { store: { select: { domain: true } } } } },
      });
      for (const pm of pMembers) {
        addCanon(risingClusterDomains, pm.product?.store?.domain);
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const wl = await prisma.watchlistStore.findMany({
      take: 800,
      select: { domain: true },
    });
    for (const w of wl) {
      addCanon(watchlistDomains, w.domain);
    }
  } catch {
    /* ignore */
  }

  // Feedback loop: watchlist spikes (24h) → domains
  try {
    const alerts = await prisma.watchlistAlertLog.findMany({
      where: { createdAt: { gte: dayAgo } },
      take: 120,
      orderBy: { createdAt: "desc" },
      select: { watchlistId: true },
    });
    const ids = [...new Set(alerts.map((a) => a.watchlistId))].slice(0, 40);
    if (ids.length) {
      const stores = await prisma.watchlistStore.findMany({
        where: { watchlistId: { in: ids } },
        take: 600,
        select: { domain: true },
      });
      for (const s of stores) addCanon(watchlistSpikeDomains, s.domain);
    }
  } catch {
    /* ignore */
  }

  // Feedback loop: compare rivals (24h) → candidate domains
  try {
    const rows = await prisma.discoveryCandidate.findMany({
      where: { createdAt: { gte: dayAgo }, sourceTypeHint: { in: ["COMPARE_RIVAL", "COMPARE"] } },
      take: 250,
      orderBy: { createdAt: "desc" },
      select: { domain: true },
    });
    for (const r of rows) addCanon(compareRivalDomains, r.domain);
  } catch {
    /* ignore */
  }

  // Storefront richness: new products (24h) + offer density (24h)
  try {
    const products = await prisma.product.findMany({
      where: { createdAt: { gte: dayAgo } },
      take: 500,
      orderBy: { createdAt: "desc" },
      select: { store: { select: { domain: true } }, metadata: true },
    });
    let offerHits = 0;
    for (const p of products) {
      addCanon(newProducts24hDomains, p.store?.domain);
      const meta = p.metadata as Record<string, unknown> | null;
      if (meta && typeof meta === "object" && meta.offerSignals) {
        addCanon(offerDenseDomains, p.store?.domain);
        offerHits += 1;
        if (offerHits > 240) break;
      }
    }
  } catch {
    /* ignore */
  }

  return {
    boardDomains,
    trendingDomains,
    creativeWinnerDomains,
    risingClusterDomains,
    watchlistDomains,
    watchlistSpikeDomains,
    compareRivalDomains,
    newProducts24hDomains,
    offerDenseDomains,
  };
}

export function scoreContextForDomain(domain: string, ctx: DiscoveryScoringContext) {
  return {
    boardOverlap: ctx.boardDomains.has(domain),
    trendingProductOverlap: ctx.trendingDomains.has(domain),
    creativeWinnerOverlap: ctx.creativeWinnerDomains.has(domain),
    historicalRisingCluster: ctx.risingClusterDomains.has(domain),
    watchlistAdjacency: ctx.watchlistDomains.has(domain),
    watchlistSpikeOverlap: ctx.watchlistSpikeDomains.has(domain),
    compareRivalOverlap: ctx.compareRivalDomains.has(domain),
    newProducts24hOverlap: ctx.newProducts24hDomains.has(domain),
    offerDenseOverlap: ctx.offerDenseDomains.has(domain),
  };
}
