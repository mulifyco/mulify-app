import type { SourceType } from "@/types";

export type SourceCapability = "direct_ingest" | "discovery_only";

export function sourceCapability(type: SourceType): SourceCapability {
  switch (type) {
    case "SHOPIFY_DOMAIN":
    case "SHOPIFY_STOREFRONT":
    case "TIKTOK_PAGE":
      return "direct_ingest";
    case "KEYWORD":
    case "META_PAGE":
    case "CATEGORY":
      return "discovery_only";
    default:
      // Keep legacy and special types runnable unless explicitly marked discovery-only.
      return "direct_ingest";
  }
}

export function isDirectIngestSource(type: SourceType): boolean {
  return sourceCapability(type) === "direct_ingest";
}

export function isDiscoveryOnlySource(type: SourceType): boolean {
  return sourceCapability(type) === "discovery_only";
}

export function sourceCapabilityLabel(type: SourceType): "Direct ingest" | "Discovery only" {
  return isDiscoveryOnlySource(type) ? "Discovery only" : "Direct ingest";
}

