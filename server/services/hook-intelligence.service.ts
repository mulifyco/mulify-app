import prisma from "@/lib/prisma";
import { canonicalDiscoveryStoreDomain } from "@/lib/intelligence/discovery-coverage";
import { angleTypeForHook, canonicalHook, nearDuplicateKey, personaBridgeForHook, type AngleType } from "@/lib/intelligence/hooks";

type Platform = "FACEBOOK" | "INSTAGRAM" | "AUDIENCE_NETWORK" | "MESSENGER" | "META" | "TIKTOK" | "SHOPIFY" | "UNKNOWN";

export type HookIntelRow = {
  canonicalHook: string;
  angleType: AngleType;
  totalMentions24h: number;
  storeCount: number;
  platformWins: Array<{ platform: Platform; mentions: number }>;
  offerMatches: Array<{ offer: string; mentions: number }>;
  persona: ReturnType<typeof personaBridgeForHook>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function inc<K extends string>(m: Map<K, number>, k: K, n = 1) {
  m.set(k, (m.get(k) ?? 0) + n);
}

function extractHookCandidatesFromAd(ad: {
  platform: Platform;
  adText: string | null;
  adTitle: string | null;
  metadata: unknown;
}): string[] {
  const out: string[] = [];
  const meta = asRecord(ad.metadata) ?? {};

  const tiktokHook = typeof meta.hookPhrase === "string" ? meta.hookPhrase : null;
  if (tiktokHook) out.push(tiktokHook);

  const depth = asRecord(meta.creativeDepth);
  if (depth) {
    const variants = [
      ...(Array.isArray(depth.headlineVariants) ? depth.headlineVariants : []),
      ...(Array.isArray(depth.bodyTextVariants) ? depth.bodyTextVariants : []),
    ].filter((x): x is string => typeof x === "string");
    out.push(...variants.slice(0, 8));
  }

  if (ad.adTitle) out.push(ad.adTitle);
  if (ad.adText) out.push(ad.adText);
  return out.filter(Boolean).slice(0, 14);
}

async function offerStatsForStores(storeDomains: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!storeDomains.length) return out;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const products = await prisma.product.findMany({
    where: { createdAt: { gte: since24h }, store: { domain: { in: storeDomains } } },
    take: 600,
    orderBy: { createdAt: "desc" },
    select: { metadata: true, store: { select: { domain: true } } },
  });
  for (const p of products) {
    const meta = asRecord(p.metadata);
    const offer = meta ? asRecord(meta.offerSignals) : null;
    if (!offer) continue;
    const blob = JSON.stringify(offer).toLowerCase();
    const keys: Array<[string, boolean]> = [
      ["free_shipping", blob.includes("free shipping") || blob.includes("free_shipping")],
      ["guarantee", blob.includes("guarantee") || blob.includes("money back") || blob.includes("refund")],
      ["subscription", blob.includes("subscribe") || blob.includes("subscription")],
      ["bundle", blob.includes("bundle") || blob.includes("buy 2") || blob.includes("multi")],
      ["urgency", blob.includes("limited") || blob.includes("ends") || blob.includes("low stock") || blob.includes("countdown")],
    ];
    for (const [k, ok] of keys) {
      if (ok) inc(out as any, k as any, 1);
    }
  }
  return out;
}

export async function hookIntelligenceForEntity(params: { entityType: string; entityId: string }) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Resolve ad scope
  let adIds: string[] | null = null;
  let storeDomainHint: string | null = null;

  if (params.entityType === "CREATIVE_CLUSTER") {
    const members = await prisma.creativeClusterMember.findMany({
      where: { clusterId: params.entityId },
      take: 1200,
      select: { adId: true },
    });
    adIds = members.map((m) => m.adId);
  } else if (params.entityType === "PRODUCT") {
    const p = await prisma.product.findUnique({
      where: { id: params.entityId },
      select: { store: { select: { domain: true } } },
    });
    storeDomainHint = p?.store?.domain ?? null;
  } else if (params.entityType === "STORE") {
    const s = await prisma.store.findUnique({ where: { id: params.entityId }, select: { domain: true } });
    storeDomainHint = s?.domain ?? null;
  }

  const ads = await prisma.ad.findMany({
    where: {
      ...(adIds ? { id: { in: adIds.slice(0, 1200) } } : { lastSeenAt: { gte: since24h } }),
    },
    take: adIds ? 1200 : 1600,
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      platform: true,
      adText: true,
      adTitle: true,
      metadata: true,
      landingPages: { take: 8, select: { domain: true, url: true } },
      destinationUrl: true,
    },
  });

  const byKey = new Map<
    string,
    {
      canonicalHook: string;
      angleType: AngleType;
      mentions: number;
      storeDomains: Set<string>;
      platformMentions: Map<Platform, number>;
    }
  >();

  for (const ad of ads) {
    const platforms = String(ad.platform ?? "UNKNOWN") as Platform;
    const candidates = extractHookCandidatesFromAd({
      platform: platforms,
      adText: ad.adText,
      adTitle: ad.adTitle,
      metadata: ad.metadata,
    });
    const storeDomains = new Set<string>();
    for (const lp of ad.landingPages ?? []) {
      const d = canonicalDiscoveryStoreDomain(lp.domain) ?? canonicalDiscoveryStoreDomain(lp.url);
      if (d) storeDomains.add(d);
    }
    if (storeDomainHint) {
      const d = canonicalDiscoveryStoreDomain(storeDomainHint);
      if (d) storeDomains.add(d);
    }

    for (const raw of candidates) {
      const canon = canonicalHook(raw);
      if (!canon) continue;
      const key = nearDuplicateKey(canon);
      const angleType = angleTypeForHook(canon);
      const ex = byKey.get(key);
      if (!ex) {
        byKey.set(key, {
          canonicalHook: canon,
          angleType,
          mentions: 1,
          storeDomains,
          platformMentions: new Map<Platform, number>([[platforms, 1]]),
        });
      } else {
        ex.mentions += 1;
        for (const d of storeDomains) ex.storeDomains.add(d);
        ex.platformMentions.set(platforms, (ex.platformMentions.get(platforms) ?? 0) + 1);
      }
    }
  }

  const rows = [...byKey.values()]
    .sort((a, b) => b.mentions - a.mentions || b.storeDomains.size - a.storeDomains.size)
    .slice(0, 24);

  const storeUniverse = [...new Set(rows.flatMap((r) => [...r.storeDomains]))].slice(0, 120);
  const offerStats = await offerStatsForStores(storeUniverse);

  const out: HookIntelRow[] = rows.map((r) => {
    const platformWins = [...r.platformMentions.entries()]
      .map(([platform, mentions]) => ({ platform, mentions }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 4);
    const offers = [...offerStats.entries()]
      .map(([offer, mentions]) => ({ offer, mentions }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 5);
    return {
      canonicalHook: r.canonicalHook,
      angleType: r.angleType,
      totalMentions24h: r.mentions,
      storeCount: r.storeDomains.size,
      platformWins,
      offerMatches: offers,
      persona: personaBridgeForHook(r.canonicalHook, r.angleType),
    };
  });

  return { hooks: out };
}

