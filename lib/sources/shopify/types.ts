import type {
  ShopifyCollectionRawPayload,
  ShopifyProductRawPayload,
  ShopifyStoreMetaRawPayload,
} from "@/types";

/**
 * Tagged union so normalization never relies on brittle structural guessing
 * (e.g. collections vs partial product shapes).
 */
export type ShopifyIntelligenceRaw =
  | (ShopifyStoreMetaRawPayload & { _ingestionKind: "STORE" })
  | (ShopifyProductRawPayload & { _ingestionKind: "PRODUCT" })
  | (ShopifyCollectionRawPayload & { _ingestionKind: "COLLECTION" });
