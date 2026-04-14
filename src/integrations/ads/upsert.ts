import prisma from "@/src/lib/prisma";
import type { ExternalAdsBatch } from "./types";

function clampInt(n: number | undefined, lo: number, hi: number): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function toExternalId(shopDomain: string, adLibraryId?: string, fallbackKey?: string): string {
  const a = adLibraryId?.trim();
  if (a) return `${shopDomain}__${a}`;
  const f = (fallbackKey ?? "unknown").slice(0, 64).replace(/\s+/g, "_");
  return `${shopDomain}__ext__${f}`;
}

function fallbackKeyForAd(ad: { creativeUrl?: string; adText?: string }): string {
  const u = (ad.creativeUrl ?? "").trim();
  const t = (ad.adText ?? "").trim();
  return `${u}|${t}`.toLowerCase();
}

export async function upsertExternalAdsBatch(batch: ExternalAdsBatch): Promise<{
  shopsUpserted: number;
  adsUpserted: number;
}> {
  let shopsUpserted = 0;
  let adsUpserted = 0;

  // Shops upsert by domain
  for (const s of batch.shops) {
    const domain = s.domain.trim().toLowerCase();
    if (!domain) continue;
    await prisma.shop.upsert({
      where: { domain },
      create: {
        domain,
        name: s.name,
        platform: s.platform,
        originCountry: s.originCountry,
        language: s.language,
        currency: s.currency,
        monthlyVisits: clampInt(s.monthlyVisits, 0, 50_000_000) ?? 0,
        estimatedDailyRevenue: Math.max(0, s.estimatedDailyRevenue ?? 0),
        activeMetaAds: clampInt(s.activeMetaAds, 0, 250) ?? 0,
        lastSeenAt: s.lastSeenAt ?? batch.fetchedAt,
        createdDate: s.lastSeenAt ?? batch.fetchedAt,
      },
      update: {
        name: s.name,
        originCountry: s.originCountry ?? undefined,
        language: s.language ?? undefined,
        currency: s.currency ?? undefined,
        // Only overwrite metrics if provided (avoid clobbering other refresh logic).
        ...(s.monthlyVisits != null ? { monthlyVisits: clampInt(s.monthlyVisits, 0, 50_000_000) ?? 0 } : {}),
        ...(s.estimatedDailyRevenue != null
          ? { estimatedDailyRevenue: Math.max(0, s.estimatedDailyRevenue) }
          : {}),
        ...(s.activeMetaAds != null ? { activeMetaAds: clampInt(s.activeMetaAds, 0, 250) ?? 0 } : {}),
        lastSeenAt: s.lastSeenAt ?? batch.fetchedAt,
      },
    });
    shopsUpserted++;
  }

  // Map shopDomain -> shopId
  const shopDomains = [...new Set(batch.ads.map((a) => a.shopDomain.trim().toLowerCase()).filter(Boolean))];
  const shopRows = await prisma.shop.findMany({
    where: { domain: { in: shopDomains } },
    select: { id: true, domain: true },
  });
  const shopIdByDomain = new Map(shopRows.map((s) => [s.domain, s.id]));

  for (const a of batch.ads) {
    const shopDomain = a.shopDomain.trim().toLowerCase();
    const shopId = shopIdByDomain.get(shopDomain);
    if (!shopId) continue;

    const extId = toExternalId(shopDomain, a.adLibraryId, fallbackKeyForAd(a));

    // Best-effort: if adLibraryId present, try to find existing ad for this shop+id to avoid duplicates
    if (a.adLibraryId?.trim()) {
      const existing = await prisma.ad.findFirst({
        where: { shopId, adLibraryId: a.adLibraryId.trim() },
        select: { id: true, externalId: true },
      });
      if (existing && existing.externalId !== extId) {
        // Keep existing externalId stable; update by existing.id
        await prisma.ad.update({
          where: { id: existing.id },
          data: {
            shopId,
            platform: a.platform,
            creativeType: a.creativeType,
            adText: a.adText,
            creativeUrl: a.creativeUrl,
            thumbnailUrl: a.thumbnailUrl,
            firstSeenAt: a.firstSeenAt,
            lastSeenAt: a.lastSeenAt ?? batch.fetchedAt,
            isActive: a.isActive ?? true,
            impressionsEstimate: clampInt(a.impressionsEstimate, 0, 50_000_000) ?? 0,
            adCount: clampInt(a.adCount, 1, 10_000) ?? 1,
          },
        });
        adsUpserted++;
        continue;
      }
    }

    await prisma.ad.upsert({
      where: { externalId: extId },
      create: {
        externalId: extId,
        adLibraryId: a.adLibraryId?.trim() || undefined,
        shopId,
        platform: a.platform,
        creativeType: a.creativeType,
        adText: a.adText,
        creativeUrl: a.creativeUrl,
        thumbnailUrl: a.thumbnailUrl,
        firstSeenAt: a.firstSeenAt,
        lastSeenAt: a.lastSeenAt ?? batch.fetchedAt,
        isActive: a.isActive ?? true,
        impressionsEstimate: clampInt(a.impressionsEstimate, 0, 50_000_000) ?? 0,
        adCount: clampInt(a.adCount, 1, 10_000) ?? 1,
        // Keep required fields from existing schema (not used by this dashboard model)
        platforms: ["FACEBOOK", "INSTAGRAM"],
        countries: ["US"],
      },
      update: {
        shopId,
        platform: a.platform,
        creativeType: a.creativeType,
        adText: a.adText,
        creativeUrl: a.creativeUrl,
        thumbnailUrl: a.thumbnailUrl,
        firstSeenAt: a.firstSeenAt ?? undefined,
        lastSeenAt: a.lastSeenAt ?? batch.fetchedAt,
        isActive: a.isActive ?? undefined,
        impressionsEstimate: clampInt(a.impressionsEstimate, 0, 50_000_000) ?? undefined,
        adCount: clampInt(a.adCount, 1, 10_000) ?? undefined,
      },
    });
    adsUpserted++;
  }

  return { shopsUpserted, adsUpserted };
}

