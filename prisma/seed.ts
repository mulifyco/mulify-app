import "dotenv/config";
import "../lib/env-local";
import prisma from "../lib/prisma";
import { sourceDb } from "../lib/prisma-source-delegate";
import { Plan, SourceStatus, SourceType } from "@prisma/client";
import bcrypt from "bcryptjs";

/** Deterministic demo admin for local credentials login (see lib/auth.ts). */
const DEMO_ADMIN_EMAIL = "admin@mulify.co";
const DEMO_ADMIN_PASSWORD = "admin123";

/**
 * Idempotent seed: creates two ACTIVE sources for local Meta / Shopify runs.
 * Uses mock-friendly domains and search terms when LIBRARY_MOCK_SOURCE_APIS=true
 * or when Meta token is absent in development.
 */
async function main(): Promise<void> {
  // Sources (existing behavior)
  const existingSources = await sourceDb().count();
  if (existingSources === 0) {
    await sourceDb().createMany({
      data: [
        {
          name: "Local — Meta Ads (mock-capable)",
          type: SourceType.META_ADS,
          status: SourceStatus.ACTIVE,
          config: {
            searchTerms: ["library-local-mock"],
            countries: ["US"],
          },
        },
        {
          name: "Local — Shopify storefront (mock-capable)",
          type: SourceType.SHOPIFY_STOREFRONT,
          status: SourceStatus.ACTIVE,
          config: {
            targetDomains: ["library-mock-store.local"],
            fetchStoreMeta: true,
            fetchProducts: true,
            fetchCollections: true,
            maxProductsPerStore: 50,
            maxCollectionsPerStore: 20,
          },
        },
      ],
    });
    console.info("[seed] Created META_ADS and SHOPIFY_STOREFRONT sources for local testing.");
  } else {
    console.info(`[seed] Sources already exist (${existingSources}) — skipping source seed.`);
  }

  // Minea-style demo sources (idempotent via deterministic ids)
  type DemoSource = {
    id: string;
    name: string;
    type: SourceType;
    status: SourceStatus;
    priority: number;
    isSeed: boolean;
    config: Record<string, unknown>;
    query?: string;
    pageUrl?: string;
    domain?: string;
    country?: string;
  };

  const demoSources: DemoSource[] = [
    {
      id: "seed_source_keyword_beauty_us",
      name: "Seed — Keyword: beauty (US)",
      type: SourceType.KEYWORD,
      status: SourceStatus.ACTIVE,
      query: "beauty",
      country: "US",
      priority: 10,
      isSeed: true,
      config: {},
    },
    {
      id: "seed_source_keyword_pet_us",
      name: "Seed — Keyword: pet (US)",
      type: SourceType.KEYWORD,
      status: SourceStatus.ACTIVE,
      query: "pet",
      country: "US",
      priority: 9,
      isSeed: true,
      config: {},
    },
    {
      id: "seed_source_meta_page_temu",
      name: "Seed — Meta page: temu",
      type: SourceType.META_PAGE,
      status: SourceStatus.ACTIVE,
      pageUrl: "https://www.facebook.com/temu",
      priority: 8,
      isSeed: true,
      config: {},
    },
    {
      id: "seed_source_shopify_domain_ollisse",
      name: "Seed — Shopify domain: ollisse.com",
      type: SourceType.SHOPIFY_DOMAIN,
      status: SourceStatus.ACTIVE,
      domain: "ollisse.com",
      priority: 7,
      isSeed: true,
      config: {},
    },
    {
      id: "seed_source_tiktok_page_gymshark",
      name: "Seed — TikTok page: @gymshark",
      type: SourceType.TIKTOK_PAGE,
      status: SourceStatus.ACTIVE,
      pageUrl: "https://www.tiktok.com/@gymshark",
      priority: 6,
      isSeed: true,
      config: {},
    },
  ];

  await Promise.all(
    demoSources.map((s) =>
      sourceDb().upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          name: s.name,
          type: s.type,
          status: s.status,
          query: s.query,
          pageUrl: s.pageUrl,
          domain: s.domain,
          country: s.country,
          priority: s.priority,
          isSeed: s.isSeed,
          config: s.config,
        },
        update: {
          name: s.name,
          type: s.type,
          status: s.status,
          query: s.query,
          pageUrl: s.pageUrl,
          domain: s.domain,
          country: s.country,
          priority: s.priority,
          isSeed: s.isSeed,
          updatedAt: new Date(),
        },
      })
    )
  );

  console.info(`[seed] Ensured Minea-style demo sources (${demoSources.length}).`);

  const demoAdminPasswordHash = bcrypt.hashSync(DEMO_ADMIN_PASSWORD, 10);
  await prisma.user.upsert({
    where: { email: DEMO_ADMIN_EMAIL },
    create: {
      email: DEMO_ADMIN_EMAIL,
      passwordHash: demoAdminPasswordHash,
      credits: 100,
      plan: Plan.PRO,
      billingPlan: "PRO",
      creditLogs: {
        create: [{ action: "seed_init", creditsUsed: 0 }],
      },
    },
    update: {
      passwordHash: demoAdminPasswordHash,
      plan: Plan.PRO,
      billingPlan: "PRO",
      updatedAt: new Date(),
    },
  });
  console.info(`[seed] Demo admin user ensured: ${DEMO_ADMIN_EMAIL} (password: ${DEMO_ADMIN_PASSWORD})`);

  // Dashboard-style local models requested (User / Shop / ShopMetric / CreditLog / Ad.shop relation)
  const user = await prisma.user.upsert({
    where: { email: "demo@mulify.local" },
    create: {
      email: "demo@mulify.local",
      credits: 3,
      plan: "FREE",
      creditLogs: {
        create: [
          { action: "seed_init", creditsUsed: 0 },
          { action: "login", creditsUsed: 0 },
        ],
      },
    },
    update: { updatedAt: new Date() },
  });

  const shops = await Promise.all(
    [
      {
        domain: "ollisse.com",
        name: "Ollisse Rugs",
        originCountry: "TR",
        language: "en",
        currency: "USD",
        trendScore: 82.4,
        monthlyVisits: 410_000,
        estimatedDailyRevenue: 14_500,
        activeMetaAds: 38,
      },
      {
        domain: "mulify-demo.shop",
        name: "Mulify Demo Store",
        originCountry: "US",
        language: "en",
        currency: "USD",
        trendScore: 54.2,
        monthlyVisits: 95_000,
        estimatedDailyRevenue: 3_200,
        activeMetaAds: 12,
      },
      {
        domain: "anadolu-kilim.co",
        name: "Anadolu Kilim",
        originCountry: "TR",
        language: "tr",
        currency: "TRY",
        trendScore: 67.9,
        monthlyVisits: 180_000,
        estimatedDailyRevenue: 6_800,
        activeMetaAds: 19,
      },
    ].map((s) =>
      prisma.shop.upsert({
        where: { domain: s.domain },
        create: {
          domain: s.domain,
          name: s.name,
          platform: "SHOPIFY",
          originCountry: s.originCountry,
          language: s.language,
          currency: s.currency,
          createdDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90),
          lastSeenAt: new Date(),
          trendScore: s.trendScore,
          monthlyVisits: s.monthlyVisits,
          estimatedDailyRevenue: s.estimatedDailyRevenue,
          activeMetaAds: s.activeMetaAds,
        },
        update: {
          name: s.name,
          lastSeenAt: new Date(),
          trendScore: s.trendScore,
          monthlyVisits: s.monthlyVisits,
          estimatedDailyRevenue: s.estimatedDailyRevenue,
          activeMetaAds: s.activeMetaAds,
        },
      })
    )
  );

  const today = new Date();
  const dates = [0, 7, 14, 21, 28].map((d) => new Date(today.getTime() - d * 86400000));

  for (const shop of shops) {
    for (const [idx, date] of dates.entries()) {
      const baseVisits = shop.monthlyVisits;
      const wobble = Math.round(baseVisits * (0.02 * (idx % 2 === 0 ? 1 : -1)));
      const visits = Math.max(0, baseVisits + wobble);
      const growth = idx === 0 ? 0.04 : idx === 1 ? 0.02 : -0.01;
      await prisma.shopMetric.upsert({
        where: { shopId_date: { shopId: shop.id, date } },
        create: {
          shopId: shop.id,
          date,
          monthlyVisits: visits,
          visitsGrowth1m: growth,
          estimatedDailyRevenue: shop.estimatedDailyRevenue,
          activeMetaAds: shop.activeMetaAds,
        },
        update: {
          monthlyVisits: visits,
          visitsGrowth1m: growth,
          estimatedDailyRevenue: shop.estimatedDailyRevenue,
          activeMetaAds: shop.activeMetaAds,
        },
      });
    }
  }

  // A few ads attached to shops (keeps existing Ad model intact; uses shopId optional relation)
  const demoAds = [
    {
      shopDomain: "ollisse.com",
      adLibraryId: "lib_demo_ollisse_001",
      creativeType: "IMAGE" as const,
      adText: "Handmade rugs — free shipping today.",
      creativeUrl: "https://ollisse.com/collections/frontpage",
      thumbnailUrl: "https://cdn.shopify.com/s/files/1/demo/ollisse-thumb.jpg",
      impressionsEstimate: 42000,
    },
    {
      shopDomain: "mulify-demo.shop",
      adLibraryId: "lib_demo_mulify_001",
      creativeType: "VIDEO" as const,
      adText: "New arrivals — limited drop.",
      creativeUrl: "https://mulify-demo.shop/collections/new",
      thumbnailUrl: "https://cdn.shopify.com/s/files/1/demo/mulify-thumb.jpg",
      impressionsEstimate: 18000,
    },
    {
      shopDomain: "anadolu-kilim.co",
      adLibraryId: "lib_demo_anadolu_001",
      creativeType: "CAROUSEL" as const,
      adText: "Authentic kilims — curated weekly.",
      creativeUrl: "https://anadolu-kilim.co/collections/kilim",
      thumbnailUrl: "https://cdn.shopify.com/s/files/1/demo/anadolu-thumb.jpg",
      impressionsEstimate: 26000,
    },
  ];

  for (const a of demoAds) {
    const shop = shops.find((s) => s.domain === a.shopDomain);
    if (!shop) continue;
    await prisma.ad.upsert({
      where: { externalId: `${shop.domain}__${a.adLibraryId}` },
      create: {
        externalId: `${shop.domain}__${a.adLibraryId}`,
        adLibraryId: a.adLibraryId,
        shopId: shop.id,
        platform: "META",
        creativeType: a.creativeType,
        adText: a.adText,
        creativeUrl: a.creativeUrl,
        thumbnailUrl: a.thumbnailUrl,
        impressionsEstimate: a.impressionsEstimate,
        isActive: true,
        platforms: ["FACEBOOK", "INSTAGRAM"],
        countries: ["US"],
      },
      update: {
        shopId: shop.id,
        platform: "META",
        creativeType: a.creativeType,
        adText: a.adText,
        creativeUrl: a.creativeUrl,
        thumbnailUrl: a.thumbnailUrl,
        impressionsEstimate: a.impressionsEstimate,
        lastSeenAt: new Date(),
      },
    });
  }

  console.info(
    `[seed] Seeded dashboard models: user=${user.email}, shops=${shops.length}, shopMetrics=${dates.length *
      shops.length}, demoAds=${demoAds.length}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
