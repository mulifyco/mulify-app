/**
 * Canonical identity for normalized entities (stores/products) — aligns host variants
 * without the aggressive discovery denylist (marketplaces etc. still normalize for keying).
 */

import { canonicalDiscoveryStoreDomain } from "@/lib/intelligence/discovery-coverage";
import { normalizeShopifyDomain } from "@/lib/url";

/**
 * Best-effort storefront hostname for Store / Product upserts.
 * Uses discovery canonicalization (checkout./shop. fold, UTM strip) when it yields a host;
 * otherwise falls back to basic hostname normalization.
 */
export function canonicalStoreDomainForEntity(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const fromDiscovery = canonicalDiscoveryStoreDomain(trimmed);
  if (fromDiscovery) return fromDiscovery;
  return normalizeShopifyDomain(trimmed);
}
