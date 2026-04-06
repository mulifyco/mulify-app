import { extractDomain, normalizeUrl, normalizeShopifyDomain } from "@/lib/url";

/** Fingerprint for duplicate detection: protocol-stripped, www-stripped host, normalized path. */
export function urlFingerprint(raw: string | null | undefined): string | null {
  const n = raw ? normalizeUrl(raw) : null;
  if (!n) return null;
  try {
    const u = new URL(n);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const search = u.search ? u.search : "";
    return `${host}${path === "" ? "/" : path}${search}`;
  } catch {
    return null;
  }
}

export function rootDomainFromUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return extractDomain(raw) ?? normalizeShopifyDomain(raw);
}

export function landingPageFieldsFromNormalizedUrl(normalizedUrl: string): {
  url: string;
  domain: string;
  path: string;
} | null {
  try {
    const u = new URL(normalizedUrl);
    const domain = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname || "/";
    if (path === "") path = "/";
    return { url: normalizedUrl, domain, path };
  } catch {
    return null;
  }
}
