import prisma from "@/lib/prisma";

export type LeadSuggestion = {
  domain: string;
  storeId: string | null;
  companyName: string | null;
  estimatedPotentialScore: number;
  reason: string;
  tags: string[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function uniq(arr: string[]) {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

function potentialFromStore(s: {
  trafficScore: number | null;
  winningProbabilityScore: number | null;
  lastSeenAt: Date | null;
  productsCount?: number;
}): number {
  const base = clamp((Number(s.trafficScore ?? 0) + Number(s.winningProbabilityScore ?? 0)) / 2, 0, 100);
  const recentBoost = s.lastSeenAt && Date.now() - s.lastSeenAt.getTime() < 7 * 86400000 ? 8 : 0;
  const catalogBoost = s.productsCount != null ? clamp(Math.log10(Math.max(1, s.productsCount)) * 6, 0, 12) : 0;
  return clamp(Math.round(base + recentBoost + catalogBoost), 0, 100);
}

export async function suggestLeads(params?: { take?: number }): Promise<LeadSuggestion[]> {
  const take = Math.max(1, Math.min(50, params?.take ?? 20));

  const [topStores, recentWatchlistSpikes] = await Promise.all([
    prisma.store
      .findMany({
        orderBy: [{ winningProbabilityScore: "desc" }, { trafficScore: "desc" }, { lastSeenAt: "desc" }],
        take,
        select: {
          id: true,
          domain: true,
          name: true,
          lastSeenAt: true,
          trafficScore: true,
          winningProbabilityScore: true,
          _count: { select: { products: true } },
        },
      })
      .catch(() => []),
    prisma.watchlistAlertLog
      .findMany({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, type: true, severity: true, delta: true, createdAt: true, watchlistId: true },
      })
      .catch(() => []),
  ]);

  const domainsFromSpikes: string[] = [];
  for (const a of recentWatchlistSpikes) {
    const d = a.delta as unknown;
    if (d && typeof d === "object") {
      const obj = d as Record<string, unknown>;
      const v = obj.domains ?? obj.affectedDomains ?? obj.storeDomains ?? obj.domain;
      if (typeof v === "string") domainsFromSpikes.push(v);
      if (Array.isArray(v)) domainsFromSpikes.push(...v.filter((x): x is string => typeof x === "string"));
    }
  }

  const suggestions: LeadSuggestion[] = [];

  for (const s of topStores) {
    suggestions.push({
      domain: s.domain,
      storeId: s.id,
      companyName: s.name ?? null,
      estimatedPotentialScore: potentialFromStore({
        trafficScore: s.trafficScore ?? null,
        winningProbabilityScore: s.winningProbabilityScore ?? null,
        lastSeenAt: s.lastSeenAt ?? null,
        productsCount: s._count.products,
      }),
      reason: "High store momentum (traffic + win probability).",
      tags: ["high_trend"],
    });
  }

  // spike-driven leads (best-effort)
  const spikeDomains = uniq(domainsFromSpikes).slice(0, 20);
  if (spikeDomains.length) {
    const stores = await prisma.store
      .findMany({
        where: { domain: { in: spikeDomains } },
        select: { id: true, domain: true, name: true, lastSeenAt: true, trafficScore: true, winningProbabilityScore: true, _count: { select: { products: true } } },
      })
      .catch(() => []);
    const byDomain = new Map(stores.map((s) => [s.domain, s]));

    for (const d of spikeDomains) {
      const s = byDomain.get(d);
      suggestions.push({
        domain: d,
        storeId: s?.id ?? null,
        companyName: s?.name ?? null,
        estimatedPotentialScore: s
          ? potentialFromStore({ trafficScore: s.trafficScore ?? null, winningProbabilityScore: s.winningProbabilityScore ?? null, lastSeenAt: s.lastSeenAt ?? null, productsCount: s._count.products })
          : 60,
        reason: "Recent watchlist spike (competitor momentum).",
        tags: ["watchlist_spike", "follow_up"],
      });
    }
  }

  // remove domains already in Lead table (across all workspaces; suggestions are global-intel driven)
  const existing = await prisma.lead.findMany({ select: { domain: true } }).catch(() => []);
  const existingSet = new Set(existing.map((x: { domain: string }) => x.domain));
  const filtered = suggestions.filter((s) => !existingSet.has(s.domain));

  // keep best per domain
  const bestByDomain = new Map<string, LeadSuggestion>();
  for (const s of filtered) {
    const prev = bestByDomain.get(s.domain);
    if (!prev || s.estimatedPotentialScore > prev.estimatedPotentialScore) bestByDomain.set(s.domain, s);
  }

  return [...bestByDomain.values()]
    .sort((a, b) => b.estimatedPotentialScore - a.estimatedPotentialScore)
    .slice(0, take);
}

