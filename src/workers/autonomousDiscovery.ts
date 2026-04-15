import prisma from "@/src/lib/prisma";
import {
  canonicalDiscoveryStoreDomain,
  computeDiscoveryScore,
  explainDiscoverySignals,
  extractUrlsDeep,
  isBlockedDiscoveryDomain,
  likelyShopifyFromUrlOrPath,
} from "@/lib/intelligence/discovery-coverage";
import { loadDiscoveryScoringContext, scoreContextForDomain } from "@/server/services/discovery-scoring-context.service";
import { openReviewQueueItem } from "@/server/services/review-queue.service";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";

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
  const row = await prisma.source.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } });
  cachedLogSourceId = row?.id ?? null;
  return cachedLogSourceId;
}

async function logWorker(level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  const sourceId = await resolveLogSourceId();
  if (!sourceId) return;
  try {
    await prisma.syncLog.create({
      data: {
        sourceId,
        jobId: null,
        level,
        message,
        data: (data as never) ?? null,
      },
    });
  } catch {
    /* ignore */
  }
}

type Evidence = {
  domain: string;
  landingPages: Set<string>;
  rawMentions: number;
  rawSightings7d: Set<string>;
  shopifyPattern: boolean;
  productsPath: boolean;
  collectionsPath: boolean;
  myshopifyOrCdn: boolean;
  tiktokOutbound: boolean;
  distinctSources: Set<string>;
  multiEntity: boolean;
  rising7d: boolean;
};

function ensureEvidence(map: Map<string, Evidence>, domain: string): Evidence {
  const existing = map.get(domain);
  if (existing) return existing;
  const e: Evidence = {
    domain,
    landingPages: new Set<string>(),
    rawMentions: 0,
    rawSightings7d: new Set<string>(),
    shopifyPattern: false,
    productsPath: false,
    collectionsPath: false,
    myshopifyOrCdn: false,
    tiktokOutbound: false,
    distinctSources: new Set<string>(),
    multiEntity: false,
    rising7d: false,
  };
  map.set(domain, e);
  return e;
}

function addUrlEvidence(
  e: Evidence,
  url: string,
  rawId: string | null,
  in7d: boolean,
  falsePositiveCounter: { n: number }
) {
  const d = canonicalDiscoveryStoreDomain(url);
  if (!d) return;
  if (isBlockedDiscoveryDomain(d)) {
    falsePositiveCounter.n += 1;
    return;
  }
  e.domain = d;
  e.rawMentions += 1;
  if (in7d && rawId) e.rawSightings7d.add(rawId);
  const lower = url.toLowerCase();
  const shopify = likelyShopifyFromUrlOrPath(lower);
  e.shopifyPattern = e.shopifyPattern || shopify;
  e.productsPath = e.productsPath || lower.includes("/products/");
  e.collectionsPath = e.collectionsPath || lower.includes("/collections/");
  e.myshopifyOrCdn = e.myshopifyOrCdn || lower.includes("myshopify.com") || lower.includes("cdn.shopify.com");
}

function tokenSeeds(text: string): string[] {
  const s = text
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .toLowerCase();
  const words = s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && w.length <= 28)
    .filter((w) => !["shopify", "official", "store", "sale", "shop", "free", "new"].includes(w));
  const uniq = [...new Set(words)];
  return uniq.slice(0, 6);
}

async function createKeywordSeeds(limit: number): Promise<string[]> {
  const out: string[] = [];
  const take = Math.max(20, limit * 4);

  const [products, clusters, creatives] = (await Promise.all([
    prisma.product
      .findMany({ orderBy: { lastSeenAt: "desc" }, take, select: { title: true } })
      .catch(() => [] as Array<{ title: string }>),
    prisma.productCluster
      .findMany({ orderBy: { readyToScaleScore: "desc" }, take: Math.min(200, take), select: { title: true } })
      .catch(() => [] as Array<{ title: string | null }>),
    creativeClusterDb()
      .findMany({ orderBy: { creativeWinnerScore: "desc" }, take: Math.min(200, take), select: { fingerprint: true } })
      .catch(() => [] as Array<{ fingerprint: string }>),
  ])) as [
    Array<{ title: string }>,
    Array<{ title: string | null }>,
    Array<{ fingerprint: string }>,
  ];

  for (const p of products) out.push(...tokenSeeds(p.title));
  for (const c of clusters) if (c.title) out.push(...tokenSeeds(c.title));
  for (const cw of creatives) out.push(...tokenSeeds(cw.fingerprint));

  return [...new Set(out)].slice(0, limit);
}

export async function autonomousDiscoveryJob(): Promise<{
  evidenceDomains: number;
  candidatesUpserted: number;
  sourcesPromoted: number;
  keywordSeedsCreated: number;
  skippedDuplicateSources: number;
  failed: number;
  falsePositivesSuppressed: number;
  sparseMode: boolean;
}> {
  let dailyMaxNewSources = intFromEnv("AUTONOMOUS_DAILY_MAX_NEW_SOURCES", 15);
  let candidateUpsertLimit = intFromEnv("AUTONOMOUS_CANDIDATE_UPSERT_LIMIT", 180);
  let keywordSeedLimit = intFromEnv("AUTONOMOUS_KEYWORD_SEED_LIMIT", 10);
  const rawScanTake = intFromEnv("AUTONOMOUS_RAW_SCAN_TAKE", 450);
  const maxUrlTouches = intFromEnv("AUTONOMOUS_MAX_URL_TOUCHES_PER_TICK", 9000);

  const day = utcDayStart();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const [shopsCount, adsCount, boardRows, scoreCtx] = await Promise.all([
    prisma.shop.count().catch(() => 0),
    prisma.ad.count().catch(() => 0),
    prisma.boardSnapshot
      .findMany({
        where: {
          snapshotDate: {
            gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())),
          },
          itemCount: { gt: 0 },
        },
        select: { boardType: true },
      })
      .catch(() => [] as Array<{ boardType: string }>),
    loadDiscoveryScoringContext(),
  ]);
  const boardsActive = new Set(boardRows.map((r) => r.boardType)).size;
  const sparse = shopsCount < 30 || adsCount < 30 || boardsActive < 4;

  if (sparse) {
    dailyMaxNewSources = Math.max(dailyMaxNewSources, 22);
    candidateUpsertLimit = Math.max(candidateUpsertLimit, 320);
    keywordSeedLimit = Math.max(keywordSeedLimit, 18);
  }

  const promoteHigh = intFromEnv("AUTONOMOUS_PROMOTE_SCORE_HIGH", 85);
  const promoteMid = intFromEnv("AUTONOMOUS_PROMOTE_SCORE_MID", 70);
  const promoteScoreHigh = sparse ? Math.max(76, promoteHigh - 8) : promoteHigh;

  let failed = 0;
  let skippedDuplicateSources = 0;
  const falsePositiveCounter = { n: 0 };
  let urlTouches = 0;

  const evidence = new Map<string, Evidence>();

  // 1) Raw lineage: Meta/TikTok payloads + entity-linked landing pages + deep URL keys
  try {
    const raws = await prisma.rawRecord.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: sparse ? Math.max(rawScanTake, 620) : rawScanTake,
      select: {
        id: true,
        sourceId: true,
        sourceType: true,
        lastSeenAt: true,
        rawPayload: true,
        entityLinks: { take: 18, select: { entityType: true, entityId: true, landingPageId: true } },
      },
    });

    for (const r of raws) {
      const in7d = r.lastSeenAt >= sevenDaysAgo;
      const urlLimit = sparse ? 18 : 12;
      const urls = extractUrlsDeep(r.rawPayload, urlLimit);
      for (const u of urls) {
        if (urlTouches >= maxUrlTouches) break;
        urlTouches += 1;
        const d = canonicalDiscoveryStoreDomain(u);
        if (!d) continue;
        if (isBlockedDiscoveryDomain(d)) {
          falsePositiveCounter.n += 1;
          continue;
        }
        const e = ensureEvidence(evidence, d);
        e.distinctSources.add(String(r.sourceId));
        if (r.sourceType === "TIKTOK_PAGE") e.tiktokOutbound = true;
        addUrlEvidence(e, u, r.id, in7d, falsePositiveCounter);
      }

      for (const l of r.entityLinks ?? []) {
        if (l.entityType !== "LANDING_PAGE" || !l.landingPageId) continue;
        if (urlTouches >= maxUrlTouches) break;
        urlTouches += 1;
        const lp = await prisma.landingPage
          .findUnique({ where: { id: l.landingPageId }, select: { url: true, domain: true, path: true } })
          .catch(() => null);
        if (!lp?.url) continue;
        const d = canonicalDiscoveryStoreDomain(lp.domain) ?? canonicalDiscoveryStoreDomain(lp.url);
        if (!d || isBlockedDiscoveryDomain(d)) {
          if (d && isBlockedDiscoveryDomain(d)) falsePositiveCounter.n += 1;
          continue;
        }
        const e = ensureEvidence(evidence, d);
        e.landingPages.add(lp.url);
        e.distinctSources.add(String(r.sourceId));
        if (in7d) e.rawSightings7d.add(r.id);
        const pathLower = String(lp.path ?? "").toLowerCase();
        e.productsPath = e.productsPath || pathLower.includes("/products/");
        e.collectionsPath = e.collectionsPath || pathLower.includes("/collections/");
        const lower = lp.url.toLowerCase();
        e.myshopifyOrCdn = e.myshopifyOrCdn || lower.includes("myshopify.com") || lower.includes("cdn.shopify.com");
        e.shopifyPattern = e.shopifyPattern || likelyShopifyFromUrlOrPath(lower);
      }
    }
  } catch (e) {
    failed += 1;
    await logWorker("warn", "raw_lineage_scan_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  // 1b) Recent landing pages tied to ads (Meta destination / chain)
  try {
    const lps = await prisma.landingPage.findMany({
      where: {
        lastSeenAt: { gte: new Date(Date.now() - 14 * 86400000) },
        OR: [{ hasShopifySignal: true }, { ads: { some: {} } }],
      },
      orderBy: { lastSeenAt: "desc" },
      take: sparse ? 320 : 220,
      select: { url: true, domain: true, path: true },
    });
    for (const lp of lps) {
      if (urlTouches >= maxUrlTouches) break;
      urlTouches += 1;
      const d = canonicalDiscoveryStoreDomain(lp.domain) ?? canonicalDiscoveryStoreDomain(lp.url);
      if (!d || isBlockedDiscoveryDomain(d)) {
        if (d && isBlockedDiscoveryDomain(d)) falsePositiveCounter.n += 1;
        continue;
      }
      const e = ensureEvidence(evidence, d);
      e.landingPages.add(lp.url);
      e.distinctSources.add("landing_page_adline");
      const pathLower = String(lp.path ?? "").toLowerCase();
      e.productsPath = e.productsPath || pathLower.includes("/products/");
      e.collectionsPath = e.collectionsPath || pathLower.includes("/collections/");
      const lower = lp.url.toLowerCase();
      e.myshopifyOrCdn = e.myshopifyOrCdn || lower.includes("myshopify.com") || lower.includes("cdn.shopify.com");
      e.shopifyPattern = e.shopifyPattern || likelyShopifyFromUrlOrPath(lower);
    }
  } catch (e) {
    failed += 1;
    await logWorker("warn", "landing_page_scan_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  // 2) Existing store external links / socialLinks
  try {
    const stores = await prisma.store.findMany({
      where: { lastSeenAt: { gte: new Date(Date.now() - 45 * 86400000) } },
      orderBy: { lastSeenAt: "desc" },
      take: 220,
      select: { id: true, domain: true, socialLinks: true, metadata: true, lastSeenAt: true },
    });
    for (const s of stores) {
      const in7d = s.lastSeenAt >= sevenDaysAgo;
      const selfCanon = canonicalDiscoveryStoreDomain(s.domain);
      const urls = [...extractUrlsDeep(s.socialLinks, 12), ...extractUrlsDeep(s.metadata, 10)];
      for (const u of urls) {
        if (urlTouches >= maxUrlTouches) break;
        urlTouches += 1;
        const d = canonicalDiscoveryStoreDomain(u);
        if (!d || (selfCanon && d === selfCanon)) continue;
        if (isBlockedDiscoveryDomain(d)) {
          falsePositiveCounter.n += 1;
          continue;
        }
        const e = ensureEvidence(evidence, d);
        e.multiEntity = true;
        e.distinctSources.add(`store:${s.id}`);
        addUrlEvidence(e, u, in7d ? `store:${s.id}` : null, in7d, falsePositiveCounter);
      }
    }
  } catch (e) {
    failed += 1;
    await logWorker("warn", "store_external_scan_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  // 3) Historical synergy: rising stores (7d deltas)
  const risingStoreDomains = new Set<string>();
  try {
    const since = new Date(Date.now() - 8 * 86400000);
    const rows = await prisma.storeSnapshot.findMany({
      where: { snapshotDate: { gte: since } },
      orderBy: { snapshotDate: "desc" },
      take: 600,
      select: { storeId: true, deltaTrafficScore: true, deltaProductClusters: true },
    });
    const hotStoreIds = new Set(
      rows
        .filter((r) => (r.deltaTrafficScore ?? 0) >= 5 || (r.deltaProductClusters ?? 0) >= 3)
        .map((r) => r.storeId)
        .slice(0, 80)
    );
    if (hotStoreIds.size) {
      const stores = await prisma.store.findMany({ where: { id: { in: [...hotStoreIds] } }, select: { domain: true } });
      for (const s of stores) {
        const d = canonicalDiscoveryStoreDomain(s.domain);
        if (d) risingStoreDomains.add(d);
      }
    }
  } catch {
    /* snapshots may not exist */
  }

  for (const d of risingStoreDomains) {
    const e = ensureEvidence(evidence, d);
    e.rising7d = true;
    e.distinctSources.add("rising_7d");
  }

  const evidenceDomains = evidence.size;
  const picked = [...evidence.values()]
    .map((e) => {
      const ctxBonus = scoreContextForDomain(e.domain, scoreCtx);
      const signals = {
        shopifyPattern: e.shopifyPattern,
        productsPath: e.productsPath,
        collectionsPath: e.collectionsPath,
        myshopifyOrCdn: e.myshopifyOrCdn,
        landingPages: e.landingPages.size,
        rawMentions: e.rawMentions,
        distinctSources: e.distinctSources.size,
        tiktokOutbound: e.tiktokOutbound,
        multiEntity: e.multiEntity,
        rising7d: e.rising7d,
        repeated7dSightings: e.rawSightings7d.size >= 3,
        ...ctxBonus,
      };
      const score = computeDiscoveryScore(signals);
      return {
        domain: e.domain,
        score,
        reason: explainDiscoverySignals(e.domain, signals),
        evidenceCount: e.landingPages.size + e.rawMentions,
      };
    })
    .sort((a, b) => b.score - a.score || b.evidenceCount - a.evidenceCount)
    .slice(0, candidateUpsertLimit);

  const existing = await prisma.source
    .findMany({ where: { type: "SHOPIFY_DOMAIN" }, select: { domain: true } })
    .then((rows) => new Set(rows.map((r) => canonicalDiscoveryStoreDomain(r.domain ?? "")).filter(Boolean) as string[]))
    .catch(() => new Set<string>());

  const createdToday = await prisma.source
    .count({
      where: {
        type: "SHOPIFY_DOMAIN",
        createdAt: { gte: day },
        name: { startsWith: "AutoDiscovered:" },
      },
    })
    .catch(() => 0);
  let remainingBudget = Math.max(0, dailyMaxNewSources - createdToday);

  let candidatesUpserted = 0;
  let sourcesPromoted = 0;

  const dc = prisma.discoveryCandidate;
  if (dc?.upsert) {
    for (const c of picked) {
      if (!c.domain || isBlockedDiscoveryDomain(c.domain)) {
        if (c.domain && isBlockedDiscoveryDomain(c.domain)) falsePositiveCounter.n += 1;
        continue;
      }
      if (existing.has(c.domain)) {
        skippedDuplicateSources += 1;
      }

      try {
        const row = await dc.upsert({
          where: { domain: c.domain },
          create: {
            domain: c.domain,
            sourceTypeHint: "SHOPIFY_DOMAIN",
            discoveryScore: c.score,
            discoveryReason: c.reason,
            discoveredFromSourceId: "autonomous_discovery",
            rawEvidenceCount: c.evidenceCount,
            isPromoted: false,
          },
          update: {
            discoveryScore: Math.max(0, Math.min(100, Number(c.score))),
            discoveryReason: c.reason,
            rawEvidenceCount: c.evidenceCount,
            updatedAt: new Date(),
          },
        });
        candidatesUpserted += 1;

        const score = Number(row.discoveryScore ?? c.score);
        const alreadyPromotedToday = row.promotedAt ? new Date(row.promotedAt).getTime() >= day.getTime() : false;
        const shouldAutoPromote = score >= promoteScoreHigh && remainingBudget > 0 && !alreadyPromotedToday;

        if (shouldAutoPromote && !existing.has(c.domain)) {
          const created = await prisma.source
            .create({
              data: {
                name: `AutoDiscovered: ${c.domain}`,
                type: "SHOPIFY_DOMAIN",
                status: "PENDING",
                domain: c.domain,
                priority: 80,
                config: { sourceDomain: c.domain, discoveredBy: "autonomous_discovery", discoveryScore: score } as object,
                metadata: { discoveryReason: c.reason } as object,
              },
              select: { id: true },
            })
            .catch(() => null);
          if (created?.id) {
            await dc.update({
              where: { id: row.id },
              data: { isPromoted: true, promotedAt: new Date() },
            });
            sourcesPromoted += 1;
            remainingBudget -= 1;
            existing.add(c.domain);
          }
        } else if (score >= (sparse ? promoteMid - 5 : promoteMid) && score < promoteScoreHigh) {
          await openReviewQueueItem({
            type: "DISCOVERY_CANDIDATE_REVIEW",
            title: `Promote candidate: ${c.domain}`,
            reason: `Autonomous discovery tier 70–85. Score ${score}.`,
            entityType: "DISCOVERY_CANDIDATE",
            entityId: String(row.id),
            sourceId: null,
            priority: Math.min(95, 60 + Math.round(score / 2)),
            metadata: { domain: c.domain, score, reason: c.reason } as object,
          }).catch(() => null);
        }
      } catch (e) {
        failed += 1;
        await logWorker("warn", "candidate_upsert_failed", { domain: c.domain, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  let keywordSeedsCreated = 0;
  try {
    const seeds = await createKeywordSeeds(keywordSeedLimit);
    for (const term of seeds) {
      const exists = await prisma.source.findFirst({
        where: { type: "KEYWORD", query: term },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.source.create({
        data: {
          name: `AutoSeed: ${term}`,
          type: "KEYWORD",
          status: "ACTIVE",
          query: term,
          priority: sparse ? 32 : 10,
          config: { query: term, discoveredBy: "autonomous_discovery" } as object,
        },
      });
      keywordSeedsCreated += 1;
    }
  } catch (e) {
    failed += 1;
    await logWorker("warn", "keyword_seeds_failed", { error: e instanceof Error ? e.message : String(e) });
  }

  await logWorker("info", "autonomous_tick", {
    sparse: sparse,
    sparseThresholds: { shops: shopsCount, ads: adsCount, boardsActive },
    shopsCount,
    adsCount,
    evidenceDomains,
    candidatesUpserted,
    sourcesPromoted,
    keywordSeedsCreated,
    skippedDuplicateSources,
    remainingBudget,
    falsePositivesSuppressed: falsePositiveCounter.n,
    urlTouches,
  });

  return {
    evidenceDomains,
    candidatesUpserted,
    sourcesPromoted,
    keywordSeedsCreated,
    skippedDuplicateSources,
    failed,
    falsePositivesSuppressed: falsePositiveCounter.n,
    sparseMode: sparse,
  };
}
