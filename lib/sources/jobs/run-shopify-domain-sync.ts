import type { SyncRunSummary } from "@/lib/sources/shared/types";
import { ShopifyStorefrontSourceAdapter } from "@/lib/sources/shopify/adapter";
import { runPersistedSourceSync } from "@/lib/sources/ingestion/persisted-sync";

/**
 * Shopify domain discovery → storefront intelligence.
 *
 * This uses the same public storefront adapter as `SHOPIFY_STOREFRONT`,
 * but allows sources whose primary user intent is "a domain" rather than a curated storefront config.
 */
export async function runShopifyDomainSync(params: {
  sourceId: string;
  triggeredBy?: string;
  initialJobCursor?: string;
}): Promise<SyncRunSummary> {
  const adapter = new ShopifyStorefrontSourceAdapter();

  return runPersistedSourceSync({
    adapter,
    sourceId: params.sourceId,
    expectedSourceType: "SHOPIFY_DOMAIN",
    triggeredBy: params.triggeredBy ?? "manual",
    initialJobCursor: params.initialJobCursor,
  });
}

