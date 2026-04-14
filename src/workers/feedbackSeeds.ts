import prisma from "@/src/lib/prisma";
import { canonicalDiscoveryStoreDomain, isBlockedDiscoveryDomain } from "@/lib/intelligence/discovery-coverage";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

let cachedLogSourceId: string | null | undefined;
async function resolveLogSourceId(): Promise<string | null> {
  if (cachedLogSourceId !== undefined) return cachedLogSourceId;
  const row = await prisma.source.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }).catch(() => null);
  cachedLogSourceId = row?.id ?? null;
  return cachedLogSourceId;
}

function addDomain(out: Map<string, { domain: string; reasons: Set<string>; score: number }>, raw: string, reason: string, score: number) {
  const d = canonicalDiscoveryStoreDomain(raw);
  if (!d) return;
  if (isBlockedDiscoveryDomain(d)) return;
  const ex = out.get(d);
  if (!ex) {
    out.set(d, { domain: d, reasons: new Set([reason]), score });
    return;
  }
  ex.reasons.add(reason);
  ex.score = Math.max(ex.score, score);
}

export async function feedbackSeedsJob(): Promise<{
  scannedBoardDomains: number;
  scannedWatchlistDomains: number;
  candidatesCreated: number;
  candidatesUpdated: number;
  duplicatesSuppressed: number;
  dailyBudgetRemaining: number;
  winnerDomainsRecycled: number;
  watchlistSpikesRecycled: number;
}> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const day = utcDayStart();

  const maxPerTick = intFromEnv("FEEDBACK_MAX_CANDIDATES_PER_TICK", 42);
  const dailyMax = intFromEnv("FEEDBACK_DAILY_MAX_CANDIDATES", 180);
  const cooldownHours = intFromEnv("FEEDBACK_DOMAIN_COOLDOWN_HOURS", 24);
  const cooldownAfter = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

  const createdToday = await prisma.discoveryCandidate
    .count({
      where: {
        createdAt: { gte: day },
        sourceTypeHint: { startsWith: "FEEDBACK_" },
      },
    })
    .catch(() => 0);
  let budget = Math.max(0, dailyMax - createdToday);

  const systemSourceId = (await resolveLogSourceId()) ?? "feedback_seeds";

  const candidates = new Map<string, { domain: string; reasons: Set<string>; score: number }>();

  // Board winners (24h): product cluster leaders → store domains.
  try {
    const topClusters = await prisma.productCluster.findMany({
      where: {
        lastSeenAt: { gte: since24h },
        OR: [
          { readyToScaleScore: { gte: 10 } },
          { earlyMoverScore: { gte: 10 } },
          { marketLeaderScore: { gte: 10 } },
        ],
      },
      orderBy: [{ readyToScaleScore: "desc" }, { earlyMoverScore: "desc" }, { marketLeaderScore: "desc" }, { lastSeenAt: "desc" }],
      take: 36,
      select: { id: true },
    });
    const ids = topClusters.map((c) => c.id);
    if (ids.length) {
      const members = await prisma.productClusterMember.findMany({
        where: { clusterId: { in: ids } },
        take: 900,
        select: { product: { select: { store: { select: { domain: true } } } } },
      });
      for (const m of members) {
        const d = m.product?.store?.domain;
        if (d) addDomain(candidates, d, "board_winner", 84);
      }
    }
  } catch {
    /* ignore */
  }

  // Creative winners (24h): ad destinations / shops → domains.
  try {
    const clusters = await prisma.creativeCluster.findMany({
      where: { lastSeenAt: { gte: since24h }, creativeWinnerScore: { gte: 14 } },
      orderBy: [{ creativeWinnerScore: "desc" }, { lastSeenAt: "desc" }],
      take: 24,
      select: { id: true },
    });
    const ids = clusters.map((c) => c.id);
    if (ids.length) {
      const members = await prisma.creativeClusterMember.findMany({
        where: { clusterId: { in: ids } },
        take: 600,
        select: { ad: { select: { destinationUrl: true, canonicalUrl: true, shop: { select: { domain: true } } } } },
      });
      for (const m of members) {
        const a = m.ad;
        if (!a) continue;
        if (a.shop?.domain) addDomain(candidates, a.shop.domain, "creative_winner", 82);
        if (a.destinationUrl) addDomain(candidates, a.destinationUrl, "creative_winner", 82);
        if (a.canonicalUrl) addDomain(candidates, a.canonicalUrl, "creative_winner", 82);
      }
    }
  } catch {
    /* ignore */
  }

  // Watchlist spikes (24h): take the watchlist's store domains as candidates.
  let scannedWatchlistDomains = 0;
  let watchlistSpikesRecycled = 0;
  try {
    const alerts = await prisma.watchlistAlertLog.findMany({
      where: {
        createdAt: { gte: since24h },
        type: {
          in: [
            "STORE_TREND_SPIKE",
            "READY_TO_SCALE_APPEARED",
            "EARLY_MOVER_APPEARED",
            "PRODUCT_CLUSTER_SPIKE",
            "CREATIVE_CLUSTER_SPIKE",
          ],
        },
      },
      take: 180,
      orderBy: { createdAt: "desc" },
      select: { watchlistId: true, type: true },
    });
    const watchlistIds = [...new Set(alerts.map((a) => a.watchlistId))].slice(0, 40);
    if (watchlistIds.length) {
      const stores = await prisma.watchlistStore.findMany({
        where: { watchlistId: { in: watchlistIds } },
        take: 900,
        select: { domain: true },
      });
      for (const s of stores) {
        scannedWatchlistDomains += 1;
        if (s.domain) addDomain(candidates, s.domain, "watchlist_spike", 78);
      }
      watchlistSpikesRecycled = watchlistIds.length;
    }
  } catch {
    /* ignore */
  }

  // Apply caps + dedupe against existing Source + recent Candidate updates.
  const all = [...candidates.values()]
    .sort((a, b) => b.score - a.score || b.reasons.size - a.reasons.size)
    .slice(0, Math.max(1, maxPerTick));

  const domains = all.map((c) => c.domain);
  const [existingSources, existingCandidates] = await Promise.all([
    prisma.source.findMany({ where: { type: "SHOPIFY_DOMAIN", domain: { in: domains } }, select: { domain: true } }).catch(() => []),
    prisma.discoveryCandidate
      .findMany({ where: { domain: { in: domains } }, select: { domain: true, updatedAt: true, createdAt: true } })
      .catch(() => []),
  ]);
  const sourceSet = new Set(existingSources.map((s) => String(s.domain ?? "").trim()).filter(Boolean));
  const candMap = new Map(existingCandidates.map((c) => [c.domain, c]));

  let duplicatesSuppressed = 0;
  let candidatesCreated = 0;
  let candidatesUpdated = 0;

  let winnerDomainsRecycled = 0;
  for (const c of all) {
    if (budget <= 0) break;
    if (sourceSet.has(c.domain)) {
      duplicatesSuppressed += 1;
      continue;
    }
    const prev = candMap.get(c.domain);
    if (prev && prev.updatedAt && prev.updatedAt.getTime() >= cooldownAfter.getTime()) {
      duplicatesSuppressed += 1;
      continue;
    }

    const reason = [...c.reasons].join(",");
    const discoveryReason = `Feedback seed (${reason}) — recycled from live signals in last 24h.`;
    const sourceTypeHint =
      c.reasons.has("board_winner") || c.reasons.has("creative_winner") ? "FEEDBACK_BOARD" : "FEEDBACK_WATCHLIST";

    const row = await prisma.discoveryCandidate
      .upsert({
        where: { domain: c.domain },
        create: {
          domain: c.domain,
          sourceTypeHint,
          discoveryScore: Math.max(0, Math.min(100, c.score)),
          discoveryReason,
          discoveredFromSourceId: systemSourceId,
          rawEvidenceCount: 0,
          isPromoted: false,
        },
        update: {
          sourceTypeHint,
          discoveryScore: Math.max(0, Math.min(100, c.score)),
          discoveryReason,
          discoveredFromSourceId: systemSourceId,
          updatedAt: new Date(),
        },
        select: { id: true },
      })
      .catch(() => null);

    if (row) {
      if (prev) candidatesUpdated += 1;
      else candidatesCreated += 1;
      budget -= 1;
      if (c.reasons.has("board_winner") || c.reasons.has("creative_winner")) winnerDomainsRecycled += 1;
    }
  }

  const scannedBoardDomains = [...candidates.values()].filter((c) => c.reasons.has("board_winner") || c.reasons.has("creative_winner")).length;

  return {
    scannedBoardDomains,
    scannedWatchlistDomains,
    candidatesCreated,
    candidatesUpdated,
    duplicatesSuppressed,
    dailyBudgetRemaining: budget,
    winnerDomainsRecycled,
    watchlistSpikesRecycled,
  };
}

