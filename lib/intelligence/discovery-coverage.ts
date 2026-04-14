/**
 * Live coverage / discovery quality helpers: canonical storefront domains,
 * aggressive false-positive suppression, and shared discovery scoring signals.
 */

import { normalizeUrl } from "@/lib/url";

const MARKETPLACE_AND_AGGREGATOR = new Set(
  [
    "amazon.com",
    "amazon.co.uk",
    "amazon.de",
    "amazon.fr",
    "amazon.ca",
    "amazon.com.au",
    "amazon.in",
    "amazon.es",
    "amazon.it",
    "amazon.nl",
    "amazon.se",
    "amazon.pl",
    "walmart.com",
    "target.com",
    "ebay.com",
    "ebay.co.uk",
    "etsy.com",
    "aliexpress.com",
    "temu.com",
    "shein.com",
    "wish.com",
    "shopee.sg",
    "shopee.co.id",
    "lazada.sg",
    "mercadolibre.com",
    "rakuten.co.jp",
    "jd.com",
    "taobao.com",
    "tmall.com",
    "pinduoduo.com",
    "bestbuy.com",
    "costco.com",
    "wayfair.com",
    "zalando.de",
    "zalando.com",
    "asos.com",
    "nike.com",
    "adidas.com",
    "apple.com",
    "microsoft.com",
    "paypal.com",
    "stripe.com",
    "squareup.com",
    "square.com",
  ].map((h) => h.toLowerCase())
);

const AFFILIATE_AND_TRACKING = new Set(
  [
    "click.linksynergy.com",
    "linksynergy.com",
    "shareasale.com",
    "cj.com",
    "commissionjunction.com",
    "awin1.com",
    "dpbolvw.net",
    "ojrq.net",
    "anrdoezrs.net",
    "kqzyfj.com",
    "jdoqocy.com",
    "tkqlhce.com",
    "amazon-adsystem.com",
    "googlesyndication.com",
    "doubleclick.net",
    "2mdn.net",
    "adservice.google.com",
    "ads-twitter.com",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "tiktokv.com",
    "tiktokcdn.com",
    "google.com",
    "gstatic.com",
    "youtube.com",
    "youtu.be",
    "bing.com",
    "yahoo.com",
    "pinterest.com",
    "reddit.com",
    "linkedin.com",
    "twitter.com",
    "x.com",
    "snapchat.com",
    "whatsapp.com",
    "messenger.com",
  ].map((h) => h.toLowerCase())
);

const CDN_AND_STATIC = new Set(
  [
    "cloudfront.net",
    "amazonaws.com",
    "akamaized.net",
    "akamaihd.net",
    "fastly.net",
    "cloudflare.com",
    "shopifycdn.com",
    /** Exact CDN host only — do not use bare shopify.com (would match *.myshopify.com). */
    "cdn.shopify.com",
    "shop.app",
    "klaviyo.com",
    "klclick.com",
    "sendgrid.net",
    "mailchimp.com",
    "cloudinary.com",
    "imgix.net",
    "ctfassets.net",
    "contentful.com",
    "prismic.io",
    "sanity.io",
  ].map((h) => h.toLowerCase())
);

const SHORTENERS = new Set(
  [
    "bit.ly",
    "goo.gl",
    "tinyurl.com",
    "t.co",
    "ow.ly",
    "buff.ly",
    "rebrand.ly",
    "cutt.ly",
    "short.link",
    "rb.gy",
    "is.gd",
    "adf.ly",
    "sh.st",
    "shorturl.at",
    "vm.tiktok.com",
    "vt.tiktok.com",
  ].map((h) => h.toLowerCase())
);

const SUPPORT_AND_HELP = new Set(
  [
    "zendesk.com",
    "freshdesk.com",
    "intercom.io",
    "intercom.com",
    "helpscout.net",
    "helpscout.com",
    "crisp.chat",
    "drift.com",
    "hubspot.com",
    "salesforce.com",
    "atlassian.net",
    "jira.com",
    "notion.so",
    "notion.site",
  ].map((h) => h.toLowerCase())
);

const BLOG_AND_EDITORIAL = new Set(
  [
    "medium.com",
    "substack.com",
    "wordpress.com",
    "blogspot.com",
    "tumblr.com",
    "ghost.io",
    "wix.com",
    "squarespace.com",
    "webflow.io",
    "typeform.com",
    "canva.com",
  ].map((h) => h.toLowerCase())
);

const REVIEW_AND_UGC = new Set(
  [
    "trustpilot.com",
    "g2.com",
    "capterra.com",
    "yelp.com",
    "bbb.org",
    "sitejabber.com",
    "reviews.io",
    "feefo.com",
  ].map((h) => h.toLowerCase())
);

function hostMatchesSet(host: string, set: Set<string>): boolean {
  const h = host.toLowerCase();
  if (set.has(h)) return true;
  for (const entry of set) {
    if (h === entry || h.endsWith(`.${entry}`)) {
      if (h.endsWith(".myshopify.com") && (entry === "shopify.com" || entry.endsWith("shopify.com"))) {
        continue;
      }
      return true;
    }
  }
  return false;
}

/** Hostnames that must never become SHOPIFY_DOMAIN discovery sources. */
export function isBlockedDiscoveryDomain(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  if (!h || h.length < 3) return true;

  if (h === "localhost" || h.endsWith(".local")) return true;
  if (h.endsWith(".internal") || h.endsWith(".test")) return true;

  if (hostMatchesSet(h, MARKETPLACE_AND_AGGREGATOR)) return true;
  if (hostMatchesSet(h, AFFILIATE_AND_TRACKING)) return true;
  if (hostMatchesSet(h, CDN_AND_STATIC)) return true;
  if (hostMatchesSet(h, SHORTENERS)) return true;
  if (hostMatchesSet(h, SUPPORT_AND_HELP)) return true;
  if (hostMatchesSet(h, BLOG_AND_EDITORIAL)) return true;
  if (hostMatchesSet(h, REVIEW_AND_UGC)) return true;

  if (h === "linktr.ee" || h.endsWith(".linktr.ee")) return true;
  if (h === "lnk.bio" || h.endsWith(".lnk.bio")) return true;
  if (h === "beacons.ai" || h.endsWith(".beacons.ai")) return true;
  if (h === "stan.store" || h.endsWith(".stan.store")) return true;
  if (h === "bio.site" || h.endsWith(".bio.site")) return true;

  if (h.endsWith(".amazon.") || h.startsWith("amazon.")) return true;

  return false;
}

export function likelyShopifyFromUrlOrPath(urlOrPath: string): boolean {
  const s = urlOrPath.toLowerCase();
  if (s.includes("myshopify.com")) return true;
  if (s.includes("cdn.shopify.com")) return true;
  if (s.includes("/cart.js")) return true;
  if (s.includes("/products.json")) return true;
  if (s.includes("/collections.json")) return true;
  if (s.includes("/products/")) return true;
  if (s.includes("/collections/")) return true;
  if (s.includes("/checkouts/")) return true;
  return false;
}

/**
 * Strip tracking params and return a normalized absolute URL, or null.
 */
export function normalizeUrlForDiscovery(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withProto = t.includes("://") ? t : `https://${t}`;
  return normalizeUrl(withProto);
}

const STRIP_SUBDOMAIN_PREFIXES = new Set([
  "checkout",
  "shop",
  "pay",
  "buy",
  "store",
  "ws",
  "m",
  "mobile",
  "cart",
  "us",
  "eu",
  "global",
]);

/**
 * Collapse common Shopify / storefront host variants to one discovery key
 * (checkout./shop. custom domains, tracking-stripped hosts). Does not merge
 * custom domain ↔ myshopify without ingestion — only obvious subdomain folds.
 */
export function canonicalDiscoveryStoreDomain(input: string): string | null {
  const normalized = normalizeUrlForDiscovery(input) ?? (input.includes("://") ? null : normalizeUrlForDiscovery(`https://${input}`));
  let host: string;
  try {
    const u = new URL(normalized ?? (input.includes("://") ? input.trim() : `https://${input.trim()}`));
    if (!["http:", "https:"].includes(u.protocol)) return null;
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    host = input.toLowerCase().trim().replace(/^www\./, "");
  }

  if (!host || !host.includes(".")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;

  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null;

  if (!host.endsWith(".myshopify.com") && parts.length >= 3) {
    const sub = parts[0]!;
    if (STRIP_SUBDOMAIN_PREFIXES.has(sub)) {
      host = parts.slice(1).join(".");
    }
  }

  if (isBlockedDiscoveryDomain(host)) return null;
  return host;
}

export type DiscoveryScoreInput = {
  shopifyPattern: boolean;
  productsPath: boolean;
  collectionsPath: boolean;
  myshopifyOrCdn: boolean;
  landingPages: number;
  rawMentions: number;
  distinctSources: number;
  tiktokOutbound: boolean;
  multiEntity: boolean;
  rising7d?: boolean;
  repeated7dSightings?: boolean;
  boardOverlap?: boolean;
  trendingProductOverlap?: boolean;
  creativeWinnerOverlap?: boolean;
  historicalRisingCluster?: boolean;
  watchlistAdjacency?: boolean;
  /** Feedback loop signals */
  watchlistSpikeOverlap?: boolean;
  compareRivalOverlap?: boolean;
  /** Storefront richness signals */
  newProducts24hOverlap?: boolean;
  offerDenseOverlap?: boolean;
};

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.floor(n)));
}

/** Shared 0–100 discovery score (workers align on this shape). */
export function computeDiscoveryScore(s: DiscoveryScoreInput): number {
  let score = 0;
  if (s.shopifyPattern) score += 26;
  if (s.myshopifyOrCdn) score += 16;
  if (s.productsPath) score += 12;
  if (s.collectionsPath) score += 8;
  if (s.landingPages >= 2) score += 8;
  if (s.landingPages >= 5) score += 6;
  if (s.rawMentions >= 2) score += 6;
  if (s.rawMentions >= 6) score += 4;
  if (s.distinctSources >= 2) score += 6;
  if (s.distinctSources >= 4) score += 6;
  if (s.distinctSources >= 6) score += 4;
  if (s.tiktokOutbound) score += 5;
  if (s.multiEntity) score += 5;
  if (s.rising7d) score += 8;
  if (s.repeated7dSightings) score += 6;
  if (s.boardOverlap) score += 7;
  if (s.trendingProductOverlap) score += 5;
  if (s.creativeWinnerOverlap) score += 6;
  if (s.historicalRisingCluster) score += 7;
  if (s.watchlistAdjacency) score += 4;
  if (s.watchlistSpikeOverlap) score += 7;
  if (s.compareRivalOverlap) score += 6;
  if (s.newProducts24hOverlap) score += 5;
  if (s.offerDenseOverlap) score += 5;
  return clampScore(score);
}

export function explainDiscoverySignals(domain: string, s: DiscoveryScoreInput): string {
  const bits: string[] = [];
  bits.push(`domain:${domain}`);
  if (s.myshopifyOrCdn) bits.push("myshopify/cdn");
  if (s.productsPath) bits.push("products_path");
  if (s.collectionsPath) bits.push("collections_path");
  if (s.shopifyPattern) bits.push("shopify_markers");
  if (s.tiktokOutbound) bits.push("tiktok_outbound");
  if (s.rising7d) bits.push("rising_7d_store");
  if (s.repeated7dSightings) bits.push("repeated_7d");
  if (s.boardOverlap) bits.push("board_overlap");
  if (s.trendingProductOverlap) bits.push("trending_product");
  if (s.creativeWinnerOverlap) bits.push("creative_winner");
  if (s.historicalRisingCluster) bits.push("cluster_rising_30d");
  if (s.watchlistAdjacency) bits.push("watchlist_adjacent");
  if (s.watchlistSpikeOverlap) bits.push("watchlist_spike");
  if (s.compareRivalOverlap) bits.push("compare_rival");
  if (s.newProducts24hOverlap) bits.push("new_products_24h");
  if (s.offerDenseOverlap) bits.push("offer_dense");
  if (s.landingPages) bits.push(`landing_pages:${s.landingPages}`);
  if (s.rawMentions) bits.push(`raw_mentions:${s.rawMentions}`);
  if (s.distinctSources) bits.push(`sources:${s.distinctSources}`);
  if (s.multiEntity) bits.push("multi_entity");
  return bits.join(" · ").slice(0, 420);
}

const URL_LIKE_KEYS = /(url|link|href|destination|website|landing|click|redirect|target|outbound|canonical)$/i;

/**
 * Walk JSON for http(s) URLs; prioritize keys that look like outbound links.
 */
export function extractUrlsDeep(value: unknown, limit: number): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  function pushUrl(s: string) {
    const t = s.trim();
    if (!t.startsWith("http://") && !t.startsWith("https://")) return;
    if (out.length >= limit) return;
    out.push(t);
  }
  function walk(v: unknown, keyHint: string) {
    if (out.length >= limit) return;
    if (v == null) return;
    if (typeof v === "string") {
      const s = v.trim();
      if (s.startsWith("http://") || s.startsWith("https://")) {
        pushUrl(s);
        return;
      }
      if (URL_LIKE_KEYS.test(keyHint) && s.includes(".") && s.length < 400 && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) {
        pushUrl(s.includes("://") ? s : `https://${s}`);
      }
      return;
    }
    if (typeof v !== "object") return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      for (const x of v) walk(x, keyHint);
      return;
    }
    const obj = v as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      const child = obj[k];
      if (typeof child === "string" && URL_LIKE_KEYS.test(k)) {
        const s = child.trim();
        if (s.startsWith("http://") || s.startsWith("https://")) pushUrl(s);
        else if (s.includes(".") && s.length < 400 && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) {
          pushUrl(s.includes("://") ? s : `https://${s}`);
        }
      }
      walk(child, k);
    }
  }
  walk(value, "");
  return out.slice(0, limit);
}

/** Detect redirect chains that loop (for future expanders). */
export function wouldRedirectLoop(chain: string[]): boolean {
  const hosts = chain
    .map((u) => {
      try {
        return new URL(u).hostname.toLowerCase();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  return new Set(hosts).size < hosts.length;
}
