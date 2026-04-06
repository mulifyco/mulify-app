import type { SyncRunSummary } from "@/lib/sources/shared/types";
import { ShopifyStorefrontSourceAdapter } from "@/lib/sources/shopify/adapter";
import { runPersistedSourceSync } from "@/lib/sources/ingestion/persisted-sync";

/**
 * Public storefront intelligence: paginated products/collections + optional cart.js signal.
 */
export async function runShopifyStoreSync(params: {
  sourceId: string;
  triggeredBy?: string;
  initialJobCursor?: string;
}): Promise<SyncRunSummary> {
  const adapter = new ShopifyStorefrontSourceAdapter();

  return runPersistedSourceSync({
    adapter,
    sourceId: params.sourceId,
    expectedSourceType: "SHOPIFY_STOREFRONT",
    triggeredBy: params.triggeredBy ?? "manual",
    initialJobCursor: params.initialJobCursor,
  });
}
