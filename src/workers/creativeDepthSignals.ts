import prisma from "@/src/lib/prisma";
import { canonicalDiscoveryStoreDomain, isBlockedDiscoveryDomain } from "@/lib/intelligence/discovery-coverage";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function creativeDepthSignalsJob(): Promise<{
  newAdVariations24h: number;
  creativeBurstsDetected24h: number;
  repeatedHooks24h: number;
  lineageRichStores24h: number;
  platformCrossoverCreatives24h: number;
}> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const burstThreshold = intFromEnv("CREATIVE_BURST_THRESHOLD", 12);
  const hookMinCount = intFromEnv("REPEATED_HOOK_MIN_COUNT", 6);

  const ads = await prisma.ad
    .findMany({
      where: { lastSeenAt: { gte: since24h } },
      take: 5000,
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        platform: true,
        pageId: true,
        destinationUrl: true,
        canonicalUrl: true,
        metadata: true,
        landingPages: { take: 6, select: { domain: true } },
      },
    })
    .catch(() => [] as any[]);

  const newAdVariations24h = ads.length;

  const storeCount = new Map<string, number>();
  const hookCount = new Map<string, number>();
  const lineageRichStore = new Set<string>();
  const crossoverCount = new Map<string, Set<string>>();

  for (const a of ads) {
    const domains = new Set<string>();
    for (const lp of a.landingPages ?? []) {
      const d = canonicalDiscoveryStoreDomain(lp.domain);
      if (d && !isBlockedDiscoveryDomain(d)) domains.add(d);
    }
    const d0 = domains.values().next().value as string | undefined;
    if (d0) storeCount.set(d0, (storeCount.get(d0) ?? 0) + 1);

    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const depth = meta.creativeDepth as Record<string, unknown> | undefined;
    if (depth && typeof depth === "object") {
      const variationCount = typeof depth.variationCount === "number" ? depth.variationCount : 0;
      const destHosts = Array.isArray(depth.destinationHosts) ? depth.destinationHosts.length : 0;
      if (variationCount >= 4 || destHosts >= 2) {
        if (d0) lineageRichStore.add(d0);
      }
    }

    const hook = typeof meta.hookPhrase === "string" ? meta.hookPhrase.trim().toLowerCase() : "";
    if (hook && hook.length >= 8) hookCount.set(hook, (hookCount.get(hook) ?? 0) + 1);

    // Platform crossover per "creative family" (Meta) or per pageId fallback.
    const fam =
      (depth && typeof depth.creativeFamilyFingerprint === "string" ? String(depth.creativeFamilyFingerprint) : null) ??
      (typeof a.pageId === "string" && a.pageId ? `page:${a.pageId}` : null);
    if (fam) {
      const set = crossoverCount.get(fam) ?? new Set<string>();
      set.add(String(a.platform ?? "UNKNOWN"));
      crossoverCount.set(fam, set);
    }
  }

  const creativeBurstsDetected24h = [...storeCount.values()].filter((n) => n >= burstThreshold).length;
  const repeatedHooks24h = [...hookCount.values()].filter((n) => n >= hookMinCount).length;
  const lineageRichStores24h = lineageRichStore.size;
  const platformCrossoverCreatives24h = [...crossoverCount.values()].filter((s) => s.size >= 2).length;

  return {
    newAdVariations24h,
    creativeBurstsDetected24h,
    repeatedHooks24h,
    lineageRichStores24h,
    platformCrossoverCreatives24h,
  };
}

