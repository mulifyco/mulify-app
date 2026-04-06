import "dotenv/config";
import "../lib/env-local";
import prisma from "../lib/prisma";

/**
 * Idempotent seed: creates two ACTIVE sources for local Meta / Shopify runs.
 * Uses mock-friendly domains and search terms when LIBRARY_MOCK_SOURCE_APIS=true
 * or when Meta token is absent in development.
 */
async function main(): Promise<void> {
  const existing = await prisma.source.count();
  if (existing > 0) {
    console.info(`[seed] Skipped — ${existing} source(s) already in database.`);
    return;
  }

  await prisma.source.createMany({
    data: [
      {
        name: "Local — Meta Ads (mock-capable)",
        type: "META_ADS",
        status: "ACTIVE",
        config: {
          searchTerms: ["library-local-mock"],
          countries: ["US"],
        },
      },
      {
        name: "Local — Shopify storefront (mock-capable)",
        type: "SHOPIFY_STOREFRONT",
        status: "ACTIVE",
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
