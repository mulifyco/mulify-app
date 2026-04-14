import prisma from "@/src/lib/prisma";
import type { SourceReliabilityStatus } from "@prisma/client";
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
import { discoveryReliabilityScorePenalty } from "@/lib/sources/reliability";

type DiscoveryInputSourceType = "KEYWORD" | "META_PAGE" | "TIKTOK_PAGE";

type SourceRow = {
  id: string;
  name: string;
  type: DiscoveryInputSourceType;
  status: "ACTIVE" | "PENDING" | "PAUSED" | "ERROR";
  query: string | null;
  pageUrl: string | null;
  priority: number;
  config: unknown;
};

type LandingPageRow = {
  id: string;
  url: string;
  domain: string;
  path: string;
  hasShopifySignal: boolean | null;
};

function safeHostnameFromUrl(url: string): string | null {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname?.toLowerCase() || null;
  } catch {
    return null;
  }
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function writeSyncLog(
  sourceId: string,
  jobId: string | null,
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  await prisma.syncLog
    .create({
      data: {
        sourceId,
        jobId,
        level,
        message,
        data: (data as never) ?? null,
      },
    })
    .catch(() => null);
}

async function buildExistingShopifyDomainSet(): Promise<Set<string>> {
  const out = new Set<string>();

  const domainSources = await prisma.source.findMany({
    where: { type: "SHOPIFY_DOMAIN" },
    select: { domain: true, config: true },
  });

  for (const s of domainSources) {
    const d = typeof s.domain === "string" ? canonicalDiscoveryStoreDomain(s.domain) : null;
    if (d) out.add(d);
    if (s.config && typeof s.config === "object") {
      const c = s.config as Record<string, unknown>;
      const sd = typeof c.sourceDomain === "string" ? canonicalDiscoveryStoreDomain(c.sourceDomain) : null;
      if (sd) out.add(sd);
    }
  }

  const storefront = await prisma.source.findMany({
    where: { type: "SHOPIFY_STOREFRONT" },
    select: { config: true },
  });

  for (const s of storefront) {
    if (!s.config || typeof s.config !== "object") continue;
    const c = s.config as Record<string, unknown>;
    const candidates: string[] = [];

    if (typeof c.sourceDomain === "string") candidates.push(c.sourceDomain);
    if (typeof c.storeUrl === "string") candidates.push(c.storeUrl);
    if (Array.isArray(c.targetDomains)) {
      for (const v of c.targetDomains) {
        if (typeof v === "string") candidates.push(v);
      }
    }

    for (const v of candidates) {
      const d = canonicalDiscoveryStoreDomain(v);
      if (d) out.add(d);
    }
  }

  return out;
}

async function discoverFromMetaPage(source: SourceRow): Promise<Set<string>> {
  const out = new Set<string>();
  const pageUrl = source.pageUrl?.trim();
  if (!pageUrl) return out;

  const d = canonicalDiscoveryStoreDomain(pageUrl);
  if (d) out.add(d);
  return out;
}

/**
 * Shared path: raw_records → linked landing pages + URL scan in payloads (KEYWORD / TIKTOK_PAGE).
 */
type DomainEvidence = {
  domain: string;
  landingPages: Set<string>;
  rawMentions: number;
  rawSightings7d: Set<string>;
  shopifyPattern: boolean;
  productsPath: boolean;
  collectionsPath: boolean;
  myshopifyOrCdn: boolean;
  tiktokOutbound: boolean;
};

async function discoverEvidenceFromIngestedLineage(sourceId: string): Promise<Map<string, DomainEvidence>> {
  const out = new Map<string, DomainEvidence>();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const raw = await prisma.rawRecord.findMany({
    where: { sourceId },
    orderBy: { lastSeenAt: "desc" },
    take: 280,
    select: {
      id: true,
      lastSeenAt: true,
      rawPayload: true,
      entityLinks: {
        select: { landingPageId: true, entityType: true, entityId: true },
        take: 24,
      },
    },
  });

  const landingIds = new Set<string>();
  for (const r of raw) {
    for (const l of r.entityLinks) {
      if (l.landingPageId) landingIds.add(l.landingPageId);
    }
  }

  let lps: LandingPageRow[] = [];
  if (landingIds.size > 0) {
    lps = (await prisma.landingPage.findMany({
      where: { id: { in: [...landingIds] } },
      select: { id: true, url: true, domain: true, path: true, hasShopifySignal: true },
    })) as LandingPageRow[];
  }

  for (const lp of lps) {
    const d = canonicalDiscoveryStoreDomain(lp.domain) ?? canonicalDiscoveryStoreDomain(lp.url);
    if (!d) continue;
    if (isBlockedDiscoveryDomain(d)) continue;
    const ev =
      out.get(d) ??
      ({
        domain: d,
        landingPages: new Set<string>(),
        rawMentions: 0,
        rawSightings7d: new Set<string>(),
        shopifyPattern: false,
        productsPath: false,
        collectionsPath: false,
        myshopifyOrCdn: false,
        tiktokOutbound: false,
      } satisfies DomainEvidence);

    const shopifyHit =
      lp.hasShopifySignal === true || likelyShopifyFromUrlOrPath(lp.url) || likelyShopifyFromUrlOrPath(lp.path);
    ev.shopifyPattern = ev.shopifyPattern || shopifyHit;
    ev.productsPath = ev.productsPath || lp.url.toLowerCase().includes("/products/") || lp.path.toLowerCase().includes("/products/");
    ev.collectionsPath =
      ev.collectionsPath || lp.url.toLowerCase().includes("/collections/") || lp.path.toLowerCase().includes("/collections/");
    ev.myshopifyOrCdn =
      ev.myshopifyOrCdn || lp.url.toLowerCase().includes("myshopify.com") || lp.url.toLowerCase().includes("cdn.shopify.com");
    ev.landingPages.add(lp.id);
    out.set(d, ev);
  }

  const urlRe = /(https?:\/\/[^\s"'<>]+|[a-z0-9.-]+\.(?:com|net|org|co|io|store|shop|app)(?:\/[^\s"'<>]*)?)/gi;

  for (const r of raw) {
    if (!r.rawPayload) continue;
    const s = JSON.stringify(r.rawPayload);
    if (!s) continue;
    const in7d = r.lastSeenAt >= sevenDaysAgo;
    const deepUrls = extractUrlsDeep(r.rawPayload, 24);
    const matches = [...(s.match(urlRe) ?? []), ...deepUrls];
    const seenMatch = new Set<string>();
    let rawHadAny = false;
    for (const m of matches.slice(0, 72)) {
      if (seenMatch.has(m)) continue;
      seenMatch.add(m);
      const d = canonicalDiscoveryStoreDomain(m);
      if (!d) continue;
      if (isBlockedDiscoveryDomain(d)) continue;

      const ev =
        out.get(d) ??
        ({
          domain: d,
          landingPages: new Set<string>(),
          rawMentions: 0,
          rawSightings7d: new Set<string>(),
          shopifyPattern: false,
          productsPath: false,
          collectionsPath: false,
          myshopifyOrCdn: false,
          tiktokOutbound: false,
        } satisfies DomainEvidence);

      rawHadAny = true;
      ev.rawMentions += 1;
      if (in7d) ev.rawSightings7d.add(r.id);
      const lower = String(m).toLowerCase();
      ev.productsPath = ev.productsPath || lower.includes("/products/") || lower.includes("/products.json");
      ev.collectionsPath = ev.collectionsPath || lower.includes("/collections/") || lower.includes("/collections.json");
      ev.myshopifyOrCdn = ev.myshopifyOrCdn || lower.includes("myshopify.com") || lower.includes("cdn.shopify.com");
      ev.shopifyPattern = ev.shopifyPattern || likelyShopifyFromUrlOrPath(lower);

      // TikTok ingestion outbound stubs: payload.kind === "tiktok_outbound"
      if (lower.includes("\"kind\":\"tiktok_outbound\"") || lower.includes("tiktok_outbound")) {
        ev.tiktokOutbound = true;
      }

      out.set(d, ev);
    }

    if (!rawHadAny && likelyShopifyFromUrlOrPath(s)) {
      // keep silent
    }
  }

  return out;
}

async function discoverFromKeyword(source: SourceRow): Promise<Set<string>> {
  const evidence = await discoverEvidenceFromIngestedLineage(source.id);
  const out = new Set<string>([...evidence.keys()]);
  const q = source.query?.trim();
  if (!q) return out;

  const keywordLps = await prisma.landingPage.findMany({
    where: {
      OR: [{ url: { contains: q, mode: "insensitive" } }, { domain: { contains: q, mode: "insensitive" } }],
    },
    orderBy: { lastSeenAt: "desc" },
    take: 60,
    select: { domain: true, url: true, path: true, hasShopifySignal: true, id: true },
  });

  for (const lp of keywordLps) {
    const d = canonicalDiscoveryStoreDomain(lp.domain) ?? canonicalDiscoveryStoreDomain(lp.url);
    if (!d) continue;
    if (lp.hasShopifySignal === true || likelyShopifyFromUrlOrPath(lp.url) || likelyShopifyFromUrlOrPath(lp.path)) {
      out.add(d);
    }
  }

  return out;
}

async function discoverFromTiktokPage(source: SourceRow): Promise<Set<string>> {
  const evidence = await discoverEvidenceFromIngestedLineage(source.id);
  return new Set<string>([...evidence.keys()]);
}

async function createDiscoveredShopifyDomainSource(params: {
  domain: string;
  discoveredFromSourceId: string;
  discoveryReason: string;
  priority?: number;
}): Promise<"created" | "duplicate_skipped"> {
  const existing = await prisma.source.findFirst({
    where: { type: "SHOPIFY_DOMAIN", domain: params.domain },
    select: { id: true },
  });
  if (existing) return "duplicate_skipped";

  await prisma.source.create({
    data: {
      name: `Discovered: ${params.domain}`,
      type: "SHOPIFY_DOMAIN",
      status: "PENDING",
      domain: params.domain,
      isSeed: false,
      priority: params.priority ?? 1,
      config: {
        sourceDomain: params.domain,
        discoveredFromSourceId: params.discoveredFromSourceId,
        discoveryReason: params.discoveryReason,
        discoveredAt: new Date().toISOString(),
      } as never,
      metadata: undefined,
    },
  });
  return "created";
}

/**
 * Discovery phase:
 * - scans KEYWORD / META_PAGE / TIKTOK_PAGE sources
 * - emits SHOPIFY_DOMAIN sources (controlled expansion)
 * - never throws fatally (worker should not fall over)
 */
export async function discoverSourcesJob(): Promise<{
  sourcesScanned: number;
  candidateDomains: number;
  newSourcesCreated: number;
  duplicatesSkipped: number;
  falsePositivesSuppressed: number;
  sparseMode: boolean;
  promoteScoreThreshold: number;
}> {
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

  let maxDomainsPerSource = intFromEnv("DISCOVERY_MAX_DOMAINS_PER_SOURCE", 8);
  let maxNewSourcesPerTick = intFromEnv("DISCOVERY_MAX_NEW_SOURCES_PER_TICK", 20);
  let promoteScoreThreshold = intFromEnv("DISCOVERY_PROMOTE_SCORE", 70);
  let candidateUpsertLimit = intFromEnv("DISCOVERY_CANDIDATE_UPSERT_LIMIT", 200);
  if (sparse) {
    maxDomainsPerSource = Math.max(maxDomainsPerSource, 14);
    maxNewSourcesPerTick = Math.max(maxNewSourcesPerTick, 28);
    promoteScoreThreshold = Math.max(58, promoteScoreThreshold - 6);
    candidateUpsertLimit = Math.max(candidateUpsertLimit, 280);
  }

  const dailyMaxPromotions = intFromEnv("DISCOVERY_DAILY_MAX_NEW_SOURCES", 48);
  const day = utcDayStart();
  const promotedToday = await prisma.source
    .count({
      where: {
        type: "SHOPIFY_DOMAIN",
        createdAt: { gte: day },
        name: { startsWith: "Discovered:" },
      },
    })
    .catch(() => 0);
  let promotionBudget = Math.max(0, dailyMaxPromotions - promotedToday);

  const existingDomains = await buildExistingShopifyDomainSet();

  let falsePositivesSuppressed = 0;

  const candidateMap = new Map<
    string,
    {
      domain: string;
      discoveredFromSourceId: string;
      sourceTypeHint: string;
      discoveryReason: string;
      landingPages: Set<string>;
      rawMentions: number;
      rawSightings7d: number;
      distinctSources: Set<string>;
      shopifyPattern: boolean;
      productsPath: boolean;
      collectionsPath: boolean;
      myshopifyOrCdn: boolean;
      tiktokOutbound: boolean;
    }
  >();

  const sources = (await prisma.source.findMany({
    where: {
      status: "ACTIVE",
      type: { in: ["KEYWORD", "META_PAGE", "TIKTOK_PAGE"] },
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      query: true,
      pageUrl: true,
      priority: true,
      config: true,
    },
  })) as unknown as SourceRow[];

  const reliabilityById = new Map<
    string,
    {
      reliabilityStatus: SourceReliabilityStatus;
      consecutiveEmptyRuns: number;
      consecutiveFailures: number;
    }
  >();
  const reliabilityRows =
    sources.length === 0
      ? []
      : await prisma.source.findMany({
          where: { id: { in: sources.map((s) => s.id) } },
          select: {
            id: true,
            reliabilityStatus: true,
            consecutiveEmptyRuns: true,
            consecutiveFailures: true,
          },
        });
  for (const r of reliabilityRows) {
    reliabilityById.set(r.id, {
      reliabilityStatus: r.reliabilityStatus,
      consecutiveEmptyRuns: r.consecutiveEmptyRuns,
      consecutiveFailures: r.consecutiveFailures,
    });
  }

  let sourcesScanned = 0;
  let newSourcesCreated = 0;
  let duplicatesSkipped = 0;

  for (const s of sources) {
    sourcesScanned += 1;

    try {
      let domains: Set<string>;
      let evidence: Map<string, DomainEvidence> | null = null;
      if (s.type === "KEYWORD") {
        evidence = await discoverEvidenceFromIngestedLineage(s.id);
        domains = await discoverFromKeyword(s);
      } else if (s.type === "META_PAGE") {
        evidence = await discoverEvidenceFromIngestedLineage(s.id);
        const fromPage = await discoverFromMetaPage(s);
        domains = new Set<string>([...evidence.keys(), ...fromPage]);
      } else if (s.type === "TIKTOK_PAGE") {
        evidence = await discoverEvidenceFromIngestedLineage(s.id);
        domains = await discoverFromTiktokPage(s);
      } else {
        continue;
      }

      const limited = [...domains].slice(0, maxDomainsPerSource);
      await writeSyncLog(s.id, null, "info", "Discovery candidates extracted", {
        worker: "discover_sources",
        sourceType: s.type,
        candidates: limited,
      });

      for (const d0 of limited) {
        const d = canonicalDiscoveryStoreDomain(d0) ?? canonicalDiscoveryStoreDomain(String(d0));
        if (!d) continue;
        if (isBlockedDiscoveryDomain(d)) {
          falsePositivesSuppressed += 1;
          continue;
        }
        const ev = evidence?.get(d);
        let entry = candidateMap.get(d);
        if (!entry) {
          entry = {
            domain: d,
            discoveredFromSourceId: s.id,
            sourceTypeHint: s.type,
            discoveryReason: "",
            landingPages: new Set<string>(),
            rawMentions: 0,
            rawSightings7d: 0,
            distinctSources: new Set<string>(),
            shopifyPattern: false,
            productsPath: false,
            collectionsPath: false,
            myshopifyOrCdn: false,
            tiktokOutbound: false,
          };
          candidateMap.set(d, entry);
        }

        entry.distinctSources.add(s.id);
        if (ev) {
          for (const lpId of ev.landingPages) entry.landingPages.add(lpId);
          entry.rawMentions += ev.rawMentions;
          entry.rawSightings7d = Math.max(entry.rawSightings7d, ev.rawSightings7d.size);
          entry.shopifyPattern = entry.shopifyPattern || ev.shopifyPattern;
          entry.productsPath = entry.productsPath || ev.productsPath;
          entry.collectionsPath = entry.collectionsPath || ev.collectionsPath;
          entry.myshopifyOrCdn = entry.myshopifyOrCdn || ev.myshopifyOrCdn;
          entry.tiktokOutbound = entry.tiktokOutbound || ev.tiktokOutbound;
        } else {
          // META_PAGE yields host-only signal: treat as low evidence unless domain itself has Shopify-ish pattern.
          entry.shopifyPattern = entry.shopifyPattern || likelyShopifyFromUrlOrPath(d);
          entry.myshopifyOrCdn = entry.myshopifyOrCdn || d.includes("myshopify.com");
        }

        const ctxBonus = scoreContextForDomain(d, scoreCtx);
        const signals = {
          shopifyPattern: entry.shopifyPattern,
          productsPath: entry.productsPath,
          collectionsPath: entry.collectionsPath,
          myshopifyOrCdn: entry.myshopifyOrCdn,
          landingPages: entry.landingPages.size,
          rawMentions: entry.rawMentions,
          distinctSources: entry.distinctSources.size,
          tiktokOutbound: entry.tiktokOutbound,
          multiEntity: entry.landingPages.size >= 2,
          repeated7dSightings: entry.rawSightings7d >= 3,
          ...ctxBonus,
        };
        const score = computeDiscoveryScore(signals);
        const reason = explainDiscoverySignals(d, signals);

        // Prefer higher-scoring lineage for the same domain.
        if (!entry.discoveryReason || score >= promoteScoreThreshold) {
          entry.discoveredFromSourceId = s.id;
          entry.sourceTypeHint = s.type;
          entry.discoveryReason = reason;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeSyncLog(s.id, null, "warn", "Discovery failed for source (skipped)", {
        worker: "discover_sources",
        sourceType: s.type,
        error: msg,
      });
    }
  }

  const enriched = [...candidateMap.values()]
    .map((c) => {
      const ctxBonus = scoreContextForDomain(c.domain, scoreCtx);
      const signals = {
        shopifyPattern: c.shopifyPattern,
        productsPath: c.productsPath,
        collectionsPath: c.collectionsPath,
        myshopifyOrCdn: c.myshopifyOrCdn,
        landingPages: c.landingPages.size,
        rawMentions: c.rawMentions,
        distinctSources: c.distinctSources.size,
        tiktokOutbound: c.tiktokOutbound,
        multiEntity: c.landingPages.size >= 2,
        repeated7dSightings: c.rawSightings7d >= 3,
        ...ctxBonus,
      };
      const rel = reliabilityById.get(c.discoveredFromSourceId);
      const penalty = rel
        ? discoveryReliabilityScorePenalty({
            reliabilityStatus: rel.reliabilityStatus,
            consecutiveEmptyRuns: rel.consecutiveEmptyRuns,
            consecutiveFailures: rel.consecutiveFailures,
          })
        : 0;
      const baseScore = computeDiscoveryScore(signals);
      return {
        ...c,
        discoveryScore: Math.max(0, baseScore - penalty),
        rawEvidenceCount: c.rawMentions + c.landingPages.size,
      };
    })
    .sort((a, b) => b.discoveryScore - a.discoveryScore);

  const limitedUpserts = enriched.slice(0, Math.max(1, candidateUpsertLimit));
  for (const c of limitedUpserts) {
    // Controlled growth: never store blocked domains.
    if (isBlockedDiscoveryDomain(c.domain)) continue;
    await prisma.discoveryCandidate.upsert({
      where: { domain: c.domain },
      create: {
        domain: c.domain,
        sourceTypeHint: c.sourceTypeHint,
        discoveryScore: c.discoveryScore,
        discoveryReason: c.discoveryReason,
        discoveredFromSourceId: c.discoveredFromSourceId,
        rawEvidenceCount: c.rawEvidenceCount,
      },
      update: {
        discoveryScore: c.discoveryScore,
        discoveryReason: c.discoveryReason,
        sourceTypeHint: c.sourceTypeHint,
        discoveredFromSourceId: c.discoveredFromSourceId,
        rawEvidenceCount: c.rawEvidenceCount,
      },
    });
  }

  // Manual review: high-score candidates just below auto-promotion threshold.
  const reviewMin = Math.max(0, promoteScoreThreshold - 10);
  const nearThreshold = enriched
    .filter((c) => c.discoveryScore >= reviewMin && c.discoveryScore < promoteScoreThreshold)
    .slice(0, 20);
  for (const c of nearThreshold) {
    if (isBlockedDiscoveryDomain(c.domain)) continue;
    await openReviewQueueItem({
      type: "DISCOVERY_CANDIDATE_REVIEW",
      priority: Math.min(95, 55 + (c.discoveryScore - reviewMin) * 4),
      title: `Discovery candidate: ${c.domain}`,
      reason: `${c.discoveryReason} · score:${c.discoveryScore} (below promote:${promoteScoreThreshold})`.slice(0, 420),
      entityType: "DOMAIN",
      entityId: c.domain,
      sourceId: c.discoveredFromSourceId,
      metadata: {
        domain: c.domain,
        discoveryScore: c.discoveryScore,
        promoteScoreThreshold,
        rawEvidenceCount: c.rawEvidenceCount,
        sourceTypeHint: c.sourceTypeHint,
      },
    }).catch(() => null);
  }

  for (const c of enriched) {
    if (newSourcesCreated >= maxNewSourcesPerTick) break;
    if (promotionBudget <= 0) break;
    if (existingDomains.has(c.domain)) {
      duplicatesSkipped += 1;
      continue;
    }
    if (c.discoveryScore < promoteScoreThreshold) continue;

    // Only promote once per domain.
    const existingCandidate = await prisma.discoveryCandidate.findUnique({
      where: { domain: c.domain },
      select: { id: true, isPromoted: true },
    });
    if (existingCandidate?.isPromoted) continue;

    const res = await createDiscoveredShopifyDomainSource({
      domain: c.domain,
      discoveredFromSourceId: c.discoveredFromSourceId,
      discoveryReason: `${c.discoveryReason} · score:${c.discoveryScore}`.slice(0, 420),
      priority: 1,
    });

    if (res === "created") {
      newSourcesCreated += 1;
      promotionBudget -= 1;
      existingDomains.add(c.domain);
      if (existingCandidate?.id) {
        await prisma.discoveryCandidate.update({
          where: { id: existingCandidate.id },
          data: { isPromoted: true, promotedAt: new Date() },
        });
      } else {
        await prisma.discoveryCandidate.update({
          where: { domain: c.domain },
          data: { isPromoted: true, promotedAt: new Date() },
        }).catch(() => null);
      }
    } else {
      duplicatesSkipped += 1;
      existingDomains.add(c.domain);
    }
  }

  const tickLogSourceId = sources[0]?.id;
  if (tickLogSourceId) {
    await writeSyncLog(tickLogSourceId, null, "info", "Discovery tick summary", {
      worker: "discover_sources",
      candidateDomains: candidateMap.size,
      newSourcesCreated,
      duplicatesSkipped,
      sourcesDiscovered: newSourcesCreated,
      promoteScoreThreshold,
      falsePositivesSuppressed,
      sparseMode: sparse,
      promotionBudgetRemaining: promotionBudget,
    });
  }

  return {
    sourcesScanned,
    candidateDomains: candidateMap.size,
    newSourcesCreated,
    duplicatesSkipped,
    falsePositivesSuppressed,
    sparseMode: sparse,
    promoteScoreThreshold,
  };
}

