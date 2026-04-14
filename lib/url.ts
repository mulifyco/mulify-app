// URL normalization and validation utilities

/**
 * Normalize a URL to a canonical form.
 * - Lowercases the hostname
 * - Removes trailing slashes from path
 * - Removes common tracking params (utm_*, fbclid, gclid, etc.)
 * - Preserves the rest of the URL intact
 */
export function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());

    // Lowercase hostname
    url.hostname = url.hostname.toLowerCase();

    // Remove trailing slash from pathname (except root)
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // Strip tracking params
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "fbclid",
      "gclid",
      "gbraid",
      "wbraid",
      "twclid",
      "ttclid",
      "mc_cid",
      "mc_eid",
      "ref",
      "_ga",
      "s_cid",
      "cmpid",
      "irclickid",
      "clickid",
      "msclkid",
      "dclid",
    ];
    trackingParams.forEach((p) => url.searchParams.delete(p));

    // Sort remaining params for consistent fingerprinting
    url.searchParams.sort();

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Extract domain from a URL string.
 */
export function extractDomain(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Extract path from a URL string.
 */
export function extractPath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

/**
 * Check if a string is a valid URL.
 */
export function isValidUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Ensure a domain has https:// prefix.
 */
export function ensureHttps(domain: string): string {
  const d = domain.trim().toLowerCase();
  if (d.startsWith("https://") || d.startsWith("http://")) {
    return d;
  }
  return `https://${d}`;
}

/**
 * Normalize a Shopify domain to just the hostname.
 */
export function normalizeShopifyDomain(input: string): string {
  try {
    const url = new URL(ensureHttps(input));
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return input.toLowerCase().trim().replace(/^www\./, "");
  }
}

/**
 * Build a canonical Shopify product URL.
 */
export function buildShopifyProductUrl(domain: string, handle: string): string {
  const normalizedDomain = normalizeShopifyDomain(domain);
  return `https://${normalizedDomain}/products/${handle}`;
}

/**
 * Build a canonical Shopify collection URL.
 */
export function buildShopifyCollectionUrl(domain: string, handle: string): string {
  const normalizedDomain = normalizeShopifyDomain(domain);
  return `https://${normalizedDomain}/collections/${handle}`;
}

/**
 * Canonical public storefront URL for LandingPage rows (https, tracking stripped, stable path).
 * Preserves trailing slash only for homepage (`/`). Collapses repeated path slashes.
 */
export function normalizeShopifyLandingPagePublicUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProto = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  const once = normalizeUrl(withProto);
  if (!once) return null;
  try {
    const u = new URL(once);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.protocol = "https:";
    u.pathname = (u.pathname || "/").replace(/\/{2,}/g, "/") || "/";
    const second = normalizeUrl(u.toString());
    return second ?? u.toString();
  } catch {
    return null;
  }
}

/**
 * Score URL validity — returns 0–1.
 */
export function scoreUrlValidity(urls: (string | null | undefined)[]): number {
  const validUrls = urls.filter((u): u is string => Boolean(u) && isValidUrl(u as string));
  if (urls.length === 0) return 0;
  return validUrls.length / urls.length;
}
