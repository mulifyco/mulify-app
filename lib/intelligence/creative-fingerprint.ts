/**
 * Stable creative media keys for clustering — strips tracking/CDN noise so the same asset
 * with different query params maps together.
 */

import { normalizeUrl } from "@/lib/url";

function stripQuery(u: string): string {
  const i = u.indexOf("?");
  return i >= 0 ? u.slice(0, i) : u;
}

/**
 * Normalize a creative/thumbnail/video URL to a stable path key (host + tail path segments).
 */
export function creativeMediaFingerprintKey(u: string | null | undefined): string | null {
  if (!u?.trim()) return null;
  const raw = u.trim();
  const withProto = raw.includes("://") ? raw : `https://${raw}`;
  const normalized = normalizeUrl(withProto) ?? stripQuery(withProto);
  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    let path = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (!path || path === "") path = "/";
    const segs = path.split("/").filter(Boolean);
    const tail = segs.length >= 3 ? segs.slice(-3).join("/") : segs.join("/");
    if (!tail) return null;
    return `${host}/${tail}`;
  } catch {
    const s = stripQuery(normalized).trim().toLowerCase();
    if (!s) return null;
    return s.length > 220 ? s.slice(-220) : s;
  }
}
