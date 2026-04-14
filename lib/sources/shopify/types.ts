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
  | (ShopifyStoreMetaRawPayload & {
      _ingestionKind: "STORE";
      /** Best-effort HTML-derived signals (no Admin API). */
      _htmlSignals?: Record<string, unknown>;
    })
  | (ShopifyProductRawPayload & {
      _ingestionKind: "PRODUCT";
      /** Best-effort enrichment from HTML/JSON-LD/product.js */
      _offerSignals?: Record<string, unknown>;
      _htmlSignals?: Record<string, unknown>;
    })
  | (ShopifyCollectionRawPayload & {
      _ingestionKind: "COLLECTION";
      _htmlSignals?: Record<string, unknown>;
    });
