import type {
  AdsProvider,
  ExternalAdsBatchResult,
  ExternalAdRecord,
  ExternalShopRecord,
} from "../types";
import { Platform } from "@prisma/client";

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return undefined;
}

function asDate(v: unknown): Date | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = asString(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function clampInt(v: number | undefined, lo: number, hi: number): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return Math.min(hi, Math.max(lo, Math.floor(v)));
}

function normalizePlatform(v: unknown, fallback: Platform): Platform {
  const s = asString(v)?.toUpperCase();
  if (s && (Object.values(Platform) as string[]).includes(s)) return s as Platform;
  // Common aliases (cast to stay resilient if Prisma client enums lag behind schema)
  if (s === "META") return "META" as unknown as Platform;
  if (s === "SHOPIFY") return "SHOPIFY" as unknown as Platform;
  if (s === "FACEBOOK") return "FACEBOOK" as Platform;
  if (s === "INSTAGRAM") return "INSTAGRAM" as Platform;
  return fallback;
}

function normalizeCreativeType(v: unknown): ExternalAdRecord["creativeType"] {
  const s = asString(v)?.toUpperCase();
  // Avoid importing CreativeType at runtime (keeps provider resilient if Prisma client isn't regenerated).
  if (s === "IMAGE" || s === "VIDEO" || s === "CAROUSEL" || s === "TEXT" || s === "UNKNOWN") {
    return s as unknown as ExternalAdRecord["creativeType"];
  }
  if (s === "IMG") return "IMAGE" as unknown as ExternalAdRecord["creativeType"];
  return "UNKNOWN" as unknown as ExternalAdRecord["creativeType"];
}

function mapHttpResponseToBatch(data: unknown): {
  shops: ExternalShopRecord[];
  ads: ExternalAdRecord[];
  fetchedAt: Date;
  metadata?: Record<string, unknown>;
} {
  const now = new Date();
  if (!data || typeof data !== "object") {
    return { fetchedAt: now, shops: [], ads: [], metadata: { note: "non_object_payload" } };
  }

  // Support a few common shapes:
  // - { fetchedAt, shops, ads, metadata }
  // - { data: { shops, ads }, ... }
  // - Apify dataset items array: [{...}, {...}] (handled as ads-only fallback)
  const root = data as Record<string, unknown>;
  const fetchedAt = asDate(root.fetchedAt) ?? now;

  const shopsRaw =
    Array.isArray(root.shops)
      ? root.shops
      : Array.isArray((root.data as any)?.shops)
        ? (((root.data as any).shops as unknown[]) ?? [])
        : [];

  const adsRaw =
    Array.isArray(root.ads)
      ? root.ads
      : Array.isArray((root.data as any)?.ads)
        ? (((root.data as any).ads as unknown[]) ?? [])
        : Array.isArray(data)
          ? (data as unknown[])
          : [];

  const shops: ExternalShopRecord[] = [];
  for (const s0 of shopsRaw) {
    if (!s0 || typeof s0 !== "object") continue;
    const s = s0 as Record<string, unknown>;
    const domain = asString(s.domain)?.toLowerCase();
    const name = asString(s.name) ?? domain ?? "";
    if (!domain) continue;
    shops.push({
      domain,
      name,
      platform: normalizePlatform(s.platform, "SHOPIFY" as unknown as Platform),
      originCountry: asString(s.originCountry),
      language: asString(s.language),
      currency: asString(s.currency),
      monthlyVisits: clampInt(asNumber(s.monthlyVisits), 0, 50_000_000),
      estimatedDailyRevenue: Math.max(0, asNumber(s.estimatedDailyRevenue) ?? 0),
      activeMetaAds: clampInt(asNumber(s.activeMetaAds), 0, 250),
      lastSeenAt: asDate(s.lastSeenAt) ?? fetchedAt,
    });
  }

  const ads: ExternalAdRecord[] = [];
  for (const a0 of adsRaw) {
    if (!a0 || typeof a0 !== "object") continue;
    const a = a0 as Record<string, unknown>;

    const shopDomain =
      asString(a.shopDomain)?.toLowerCase() ??
      (a.shop && typeof a.shop === "object" ? asString((a.shop as any).domain)?.toLowerCase() : undefined) ??
      asString(a.domain)?.toLowerCase() ??
      undefined;

    // If the upstream doesn't include shopDomain, we can't link the ad.
    if (!shopDomain) continue;

    ads.push({
      shopDomain,
      adLibraryId: asString(a.adLibraryId) ?? asString(a.id),
      platform: normalizePlatform(a.platform, "META" as unknown as Platform),
      creativeType: normalizeCreativeType(a.creativeType),
      adText: asString(a.adText) ?? asString(a.text),
      creativeUrl: asString(a.creativeUrl) ?? asString(a.url),
      thumbnailUrl: asString(a.thumbnailUrl) ?? asString(a.thumbnail),
      firstSeenAt: asDate(a.firstSeenAt),
      lastSeenAt: asDate(a.lastSeenAt) ?? fetchedAt,
      isActive: asBool(a.isActive),
      impressionsEstimate: clampInt(asNumber(a.impressionsEstimate), 0, 50_000_000),
      adCount: clampInt(asNumber(a.adCount), 1, 10_000),
    });
  }

  const metadata =
    root.metadata && typeof root.metadata === "object" ? (root.metadata as Record<string, unknown>) : undefined;

  return { fetchedAt, shops, ads, metadata };
}

export class HttpAdsProvider implements AdsProvider {
  readonly name = "http";

  async fetchLatestAds(params?: { limitAds?: number; limitShops?: number }): Promise<ExternalAdsBatchResult> {
    const baseUrl = asString(process.env.ADS_BASE_URL);
    const apiKey = asString(process.env.ADS_API_KEY);

    if (!baseUrl) throw new Error("ADS_BASE_URL is not set");
    if (!apiKey) throw new Error("ADS_API_KEY is not set");

    const url = new URL(baseUrl.replace(/\/+$/, "") + "/run-sync-get-dataset-items");
    url.searchParams.set("token", apiKey);

    const controller = new AbortController();
    const timeoutMs = Number(process.env.ADS_TIMEOUT_MS || 120_000);
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startUrls: [
            {
              url: "https://www.facebook.com/temu",
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 404) {
          throw new Error(`HTTP provider 404 (page-not-found). Tried: ${url.toString()}`);
        }
        throw new Error(`HTTP provider error ${res.status}: ${body || res.statusText}`);
      }

      const rawJson = (await res.json()) as unknown;

      if (process.env.NODE_ENV !== "production") {
        const isArray = Array.isArray(rawJson);
        const len = isArray ? rawJson.length : 0;
        const first = isArray ? (rawJson[0] as unknown) : rawJson;
        const firstKeys =
          first && typeof first === "object" && !Array.isArray(first)
            ? Object.keys(first as Record<string, unknown>).slice(0, 20)
            : [];
        // eslint-disable-next-line no-console
        console.info("[ads:http] raw type", isArray ? "array" : typeof rawJson);
        // eslint-disable-next-line no-console
        console.info("[ads:http] raw length", len);
        // eslint-disable-next-line no-console
        console.info("[ads:http] raw first item", first);
        // eslint-disable-next-line no-console
        console.info("[ads:http] raw first keys", firstKeys);
      }

      const json = rawJson;
      const mapped = mapHttpResponseToBatch(json);

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.info("[ads:http] fetched", { shops: mapped.shops.length, ads: mapped.ads.length });
      }

      return { provider: this.name, batch: { ...mapped } };
    } catch (e) {
      if (e && typeof e === "object" && "name" in e && (e as any).name === "AbortError") {
        throw new Error("Apify request timed out");
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`HttpAdsProvider fetchLatestAds failed: ${msg}`);
    } finally {
      clearTimeout(t);
    }
  }
}

export const httpAdsProvider = new HttpAdsProvider();

