import prisma from "@/src/lib/prisma";
import { canonicalDiscoveryStoreDomain, isBlockedDiscoveryDomain } from "@/lib/intelligence/discovery-coverage";
import { angleTypeForHook, canonicalHook, nearDuplicateKey, personaBridgeForHook } from "@/lib/intelligence/hooks";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function hookIntelligenceSignalsJob(): Promise<{
  canonicalHooks24h: number;
  crossoverHooks24h: number;
  hookOfferMatched24h: number;
  hookPersonaMatched24h: number;
  topAngleCategories24h: Array<{ angleType: string; hooks: number }>;
  topWinningHooks24h: Array<{
    canonicalHook: string;
    angleType: string;
    mentions: number;
    storeCount: number;
    platformMentions: Record<string, number>;
  }>;
}> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const maxAds = intFromEnv("HOOK_INTEL_MAX_ADS_24H", 6000);
  const perHookCap = intFromEnv("HOOK_INTEL_PER_HOOK_MENTIONS_CAP", 120);

  const ads = await prisma.ad
    .findMany({
      where: { lastSeenAt: { gte: since24h } },
      take: maxAds,
      orderBy: { lastSeenAt: "desc" },
      select: {
        platform: true,
        adTitle: true,
        adText: true,
        metadata: true,
        landingPages: { take: 6, select: { domain: true, url: true } },
      },
    })
    .catch(() => [] as any[]);

  const byKey = new Map<
    string,
    {
      canonicalHook: string;
      angleType: string;
      mentions: number;
      platformMentions: Map<string, number>;
      storeDomains: Set<string>;
      offerMatched: boolean;
      personaMatched: boolean;
    }
  >();

  for (const a of ads) {
    const meta = asRecord(a.metadata) ?? {};
    const depth = asRecord(meta.creativeDepth);
    const candidates: string[] = [];

    if (typeof meta.hookPhrase === "string") candidates.push(meta.hookPhrase);

    if (depth) {
      const variants = [
        ...(Array.isArray(depth.headlineVariants) ? depth.headlineVariants : []),
        ...(Array.isArray(depth.bodyTextVariants) ? depth.bodyTextVariants : []),
      ].filter((x): x is string => typeof x === "string");
      candidates.push(...variants.slice(0, 8));
    }

    if (typeof a.adTitle === "string") candidates.push(a.adTitle);
    if (typeof a.adText === "string") candidates.push(a.adText);

    const domains = new Set<string>();
    for (const lp of a.landingPages ?? []) {
      const d = canonicalDiscoveryStoreDomain(lp.domain) ?? canonicalDiscoveryStoreDomain(lp.url);
      if (d && !isBlockedDiscoveryDomain(d)) domains.add(d);
    }

    for (const raw of candidates) {
      const canon = canonicalHook(raw);
      if (!canon) continue;
      const key = nearDuplicateKey(canon);

      const angleType = angleTypeForHook(canon);
      const persona = personaBridgeForHook(canon, angleType);
      const personaMatched = Boolean(persona?.awarenessStage && persona?.buyingIntent);

      // Offer bridge (best-effort): hooks that explicitly mention offer levers.
      const lc = canon.toLowerCase();
      const offerMatched =
        lc.includes("save") ||
        lc.includes("off") ||
        lc.includes("bundle") ||
        lc.includes("guarantee") ||
        lc.includes("refund") ||
        lc.includes("free_shipping") ||
        lc.includes("subscribe");

      const ex = byKey.get(key);
      if (!ex) {
        const pm = new Map<string, number>();
        pm.set(String(a.platform ?? "UNKNOWN"), 1);
        byKey.set(key, {
          canonicalHook: canon,
          angleType,
          mentions: 1,
          platformMentions: pm,
          storeDomains: domains,
          offerMatched,
          personaMatched,
        });
      } else if (ex.mentions < perHookCap) {
        ex.mentions += 1;
        ex.platformMentions.set(String(a.platform ?? "UNKNOWN"), (ex.platformMentions.get(String(a.platform ?? "UNKNOWN")) ?? 0) + 1);
        for (const d of domains) ex.storeDomains.add(d);
        ex.offerMatched = ex.offerMatched || offerMatched;
        ex.personaMatched = ex.personaMatched || personaMatched;
      }
    }
  }

  const canonicalHooks24h = byKey.size;
  const crossoverHooks24h = [...byKey.values()].filter((h) => h.platformMentions.size >= 2).length;
  const hookOfferMatched24h = [...byKey.values()].filter((h) => h.offerMatched).length;
  const hookPersonaMatched24h = [...byKey.values()].filter((h) => h.personaMatched).length;

  const angleCounts = new Map<string, number>();
  for (const h of byKey.values()) angleCounts.set(h.angleType, (angleCounts.get(h.angleType) ?? 0) + 1);
  const topAngleCategories24h = [...angleCounts.entries()]
    .map(([angleType, hooks]) => ({ angleType, hooks }))
    .sort((a, b) => b.hooks - a.hooks)
    .slice(0, 8);

  const topWinningHooks24h = [...byKey.values()]
    .sort((a, b) => b.mentions - a.mentions || b.storeDomains.size - a.storeDomains.size)
    .slice(0, 12)
    .map((h) => ({
      canonicalHook: h.canonicalHook,
      angleType: h.angleType,
      mentions: h.mentions,
      storeCount: h.storeDomains.size,
      platformMentions: Object.fromEntries([...h.platformMentions.entries()].slice(0, 6)),
    }));

  return {
    canonicalHooks24h,
    crossoverHooks24h,
    hookOfferMatched24h,
    hookPersonaMatched24h,
    topAngleCategories24h,
    topWinningHooks24h,
  };
}

