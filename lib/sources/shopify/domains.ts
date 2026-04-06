/**
 * Shopify storefront domain resolution — prioritises configured live domains over placeholders.
 */

import { extractDomain, normalizeShopifyDomain } from "@/lib/url";

/** Default template domain from admin UI; must never win over a real configured domain. */
export function isPlaceholderShopifyDomain(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === "example.myshopify.com";
}

export function isMyshopifyHost(hostname: string): boolean {
  return hostname.trim().toLowerCase().endsWith(".myshopify.com");
}

export interface ShopifyDomainEntry {
  /** Host used for HTTPS fetches (products.json, cart.js, …). */
  fetchHost: string;
  /** Canonical storefront domain stored on normalized Store rows. */
  canonicalDomain: string;
  /** Permanent Shopify hostname when paired with a custom domain (metadata / alias). */
  myshopifyHost?: string;
  /** Extra hostnames for the same logical shop (deduped). */
  aliases: string[];
  /** Human-readable resolution summary for logs. */
  resolutionNote: string;
  /** Normalized `sourceDomain` from source JSON when set. */
  configuredSourceDomain?: string;
  /** Hostname derived from `storeUrl` in source JSON when set. */
  storeUrlHostname?: string;
}

function orderedUniqueHostnames(inputs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of inputs) {
    const n = normalizeShopifyDomain(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Merge config + env hostnames: drop template domains when any real hostname exists.
 */
export function filterPlaceholderWhenRealExists(hosts: string[]): string[] {
  const hasNonPlaceholder = hosts.some((h) => !isPlaceholderShopifyDomain(h));
  if (!hasNonPlaceholder) return hosts;
  return hosts.filter((h) => !isPlaceholderShopifyDomain(h));
}

/**
 * Build fetch + canonical pairs. When exactly one custom domain and one *.myshopify.com
 * are present, treat them as one storefront: fetch custom host, canonical = custom, alias myshopify.
 */
export function buildShopifyDomainEntries(orderedHosts: string[]): ShopifyDomainEntry[] {
  const filtered = filterPlaceholderWhenRealExists(orderedHosts);
  if (!filtered.length) return [];

  const customs = filtered.filter((h) => !isMyshopifyHost(h));
  const myshops = filtered.filter((h) => isMyshopifyHost(h));

  if (customs.length === 1 && myshops.length === 1) {
    const canonicalDomain = customs[0];
    const myshopifyHost = myshops[0];
    return [
      {
        fetchHost: canonicalDomain,
        canonicalDomain,
        myshopifyHost,
        aliases: [myshopifyHost, canonicalDomain].filter((a, i, arr) => arr.indexOf(a) === i),
        resolutionNote:
          "paired_custom_and_myshopify: canonical=custom_domain fetch=custom_domain alias=myshopify",
      },
    ];
  }

  return filtered.map((h) => ({
    fetchHost: h,
    canonicalDomain: h,
    myshopifyHost: isMyshopifyHost(h) ? h : undefined,
    aliases: [],
    resolutionNote: isMyshopifyHost(h)
      ? "canonical=myshopify fetch=myshopify"
      : "canonical=custom fetch=custom",
  }));
}

/**
 * Priority-ordered hostname candidates from JSON config (before env merge):
 * 1. sourceDomain  2. storeUrl hostname  3. targetDomains (order preserved)
 */
export function hostnamesFromSourceJson(j: {
  sourceDomain?: string;
  storeUrl?: string;
  targetDomains?: string[];
}): string[] {
  const out: string[] = [];
  if (j.sourceDomain?.trim()) out.push(j.sourceDomain.trim());
  if (j.storeUrl?.trim()) {
    const s = j.storeUrl.trim();
    const fromUrl =
      extractDomain(s.includes("://") ? s : `https://${s}`) ?? normalizeShopifyDomain(s);
    if (fromUrl) out.push(fromUrl);
  }
  for (const d of j.targetDomains ?? []) {
    if (d?.trim()) out.push(d.trim());
  }
  return orderedUniqueHostnames(out);
}

export function mergeEnvShopifyDomains(
  fromJsonOrdered: string[],
  envDomains: string[]
): string[] {
  const envNorm = orderedUniqueHostnames(envDomains);
  return orderedUniqueHostnames([...fromJsonOrdered, ...envNorm]);
}

export function describeDomainResolution(entries: ShopifyDomainEntry[]): string {
  return entries
    .map(
      (e) =>
        `${e.canonicalDomain}←fetch:${e.fetchHost}${e.myshopifyHost ? ` (myshopify:${e.myshopifyHost})` : ""}`
    )
    .join(" | ");
}
