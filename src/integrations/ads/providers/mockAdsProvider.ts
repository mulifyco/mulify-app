import type { AdsProvider, ExternalAdsBatchResult } from "../types";
import { CreativeType, Platform } from "@prisma/client";

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function jitterPct(maxPct: number): number {
  return (Math.random() * 2 - 1) * maxPct;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export class MockAdsProvider implements AdsProvider {
  readonly name = "mock";

  async fetchLatestAds(params?: { limitAds?: number; limitShops?: number }): Promise<ExternalAdsBatchResult> {
    const fetchedAt = new Date();

    const baseShops = [
      {
        domain: "ollisse.com",
        name: "Ollisse Rugs",
        platform: Platform.SHOPIFY,
        originCountry: "TR",
        language: "en",
        currency: "USD",
        monthlyVisits: 410_000,
        estimatedDailyRevenue: 14_500,
        activeMetaAds: 38,
      },
      {
        domain: "mulify-demo.shop",
        name: "Mulify Demo Store",
        platform: Platform.SHOPIFY,
        originCountry: "US",
        language: "en",
        currency: "USD",
        monthlyVisits: 95_000,
        estimatedDailyRevenue: 3_200,
        activeMetaAds: 12,
      },
      {
        domain: "anadolu-kilim.co",
        name: "Anadolu Kilim",
        platform: Platform.SHOPIFY,
        originCountry: "TR",
        language: "tr",
        currency: "TRY",
        monthlyVisits: 180_000,
        estimatedDailyRevenue: 6_800,
        activeMetaAds: 19,
      },
    ];

    const limitShops = params?.limitShops ?? 3;
    const shops = baseShops.slice(0, limitShops).map((s) => {
      const nextVisits = clampInt(s.monthlyVisits * (1 + jitterPct(0.02)), 0, 50_000_000);
      const nextRev = Math.max(0, s.estimatedDailyRevenue * (1 + jitterPct(0.03)));
      const nextAds = clampInt((s.activeMetaAds ?? 0) + Math.round(jitterPct(0.25) * 10), 0, 250);
      return {
        ...s,
        monthlyVisits: nextVisits,
        estimatedDailyRevenue: nextRev,
        activeMetaAds: nextAds,
        lastSeenAt: fetchedAt,
      };
    });

    const adTemplates = [
      {
        creativeType: CreativeType.IMAGE,
        adText: "Handmade rugs — free shipping today.",
        creativeUrl: "https://{domain}/collections/frontpage",
        thumbnailUrl: "https://cdn.shopify.com/s/files/1/demo/thumb-1.jpg",
      },
      {
        creativeType: CreativeType.VIDEO,
        adText: "New arrivals — limited drop.",
        creativeUrl: "https://{domain}/collections/new",
        thumbnailUrl: "https://cdn.shopify.com/s/files/1/demo/thumb-2.jpg",
      },
      {
        creativeType: CreativeType.CAROUSEL,
        adText: "Curated picks — updated weekly.",
        creativeUrl: "https://{domain}/collections/best-sellers",
        thumbnailUrl: "https://cdn.shopify.com/s/files/1/demo/thumb-3.jpg",
      },
    ];

    const limitAds = params?.limitAds ?? 12;
    const ads = [];
    let i = 0;
    while (ads.length < limitAds) {
      const shop = pick(shops);
      const tmpl = pick(adTemplates);
      const idx = i++;
      const adLibraryId = `mock_${shop.domain.replace(/[^a-z0-9]+/gi, "_")}_${String(idx).padStart(3, "0")}`;
      const impressionsEstimate = clampInt(10_000 + Math.random() * 60_000, 0, 5_000_000);
      const adCount = clampInt(1 + Math.random() * 4, 1, 25);
      ads.push({
        shopDomain: shop.domain,
        adLibraryId,
        platform: Platform.META,
        creativeType: tmpl.creativeType,
        adText: tmpl.adText,
        creativeUrl: tmpl.creativeUrl.replace("{domain}", shop.domain),
        thumbnailUrl: tmpl.thumbnailUrl,
        firstSeenAt: new Date(fetchedAt.getTime() - 86400000 * clampInt(2 + Math.random() * 14, 1, 30)),
        lastSeenAt: fetchedAt,
        isActive: Math.random() > 0.12,
        impressionsEstimate,
        adCount,
      });
    }

    return {
      provider: this.name,
      batch: {
        fetchedAt,
        shops,
        ads,
        metadata: { kind: "mock", version: 1 },
      },
    };
  }
}

export const mockAdsProvider = new MockAdsProvider();

