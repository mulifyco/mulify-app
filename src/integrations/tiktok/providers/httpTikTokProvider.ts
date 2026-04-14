/**
 * Best-effort TikTok profile snapshot (HTML scrape).
 * Never throws — empty shape on timeout, non-HTML, or parse failure.
 */

import { createHash } from "crypto";

export const TIKTOK_PLATFORM = "TIKTOK" as const;

export interface TikTokVideoNormalized {
  videoId: string;
  creativeUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  outboundUrl?: string;
  /** Best-effort music/sound lineage */
  musicId?: string;
  musicTitle?: string;
  /** Best-effort hook phrase + hashtags */
  hookPhrase?: string;
  hashtags?: string[];
}

export interface TikTokFetchResult {
  profileHandle: string | null;
  profileUrl: string | null;
  videos: TikTokVideoNormalized[];
  /** Deduped external URLs (bio, CTA, landing hints). */
  outboundLinks: string[];
  metrics: {
    videosFetched: number;
    outboundLinksFound: number;
  };
}

function stripAt(h: string | null | undefined): string | null {
  if (!h?.trim()) return null;
  return h.trim().replace(/^@+/, "") || null;
}

export function resolveTikTokProfileHandle(params: {
  pageUrl?: string | null;
  handle?: string | null;
}): string | null {
  const h = stripAt(params.handle);
  if (h) return h;
  const u = params.pageUrl?.trim();
  if (!u) return null;
  try {
    const url = new URL(u.includes("://") ? u : `https://${u}`);
    const m = url.pathname.match(/@([^/?#]+)/);
    if (m?.[1]) return stripAt(m[1]);
  } catch {
    /* ignore */
  }
  return null;
}

export function buildTikTokProfileUrl(handle: string): string {
  const h = stripAt(handle);
  return `https://www.tiktok.com/@${h ?? handle.replace(/^@+/, "")}`;
}

function isTiktokCdnHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "tiktok.com" ||
    h.endsWith(".tiktok.com") ||
    h === "tiktokcdn.com" ||
    h.endsWith(".tiktokcdn.com") ||
    h.includes("tiktokcdn")
  );
}

function safeUrl(href: string): string | null {
  const t = href.trim();
  if (!t.startsWith("http://") && !t.startsWith("https://")) return null;
  try {
    const u = new URL(t);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (isTiktokCdnHost(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function collectUrlsFromString(s: string, bucket: Set<string>): void {
  const re = /https?:\/\/[^\s"'<>]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const u = safeUrl(m[0].replace(/[,).;]+$/, ""));
    if (u) bucket.add(u.split("#")[0] ?? u);
  }
}

function hookPhraseFromCaption(caption: string | undefined | null): string | null {
  const t = (caption ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const cleaned = t
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#@][\p{L}\p{N}_-]+/gu, "")
    .replace(/[^\p{L}\p{N}\s'’\-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const words = cleaned.split(" ").filter(Boolean).slice(0, 7);
  const phrase = words.join(" ").toLowerCase();
  if (phrase.length < 8) return null;
  return phrase.slice(0, 64);
}

function hashtagsFromCaption(caption: string | undefined | null, cap = 10): string[] {
  const t = caption ?? "";
  const re = /#([\p{L}\p{N}_-]{2,40})/gu;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const tag = String(m[1] ?? "").toLowerCase();
    if (!tag) continue;
    out.push(tag);
    if (out.length >= cap) break;
  }
  return [...new Set(out)];
}

/** TikTok Shop + short redirects often appear outside generic URL regex matches. */
function collectTikTokCommerceHints(html: string, bucket: Set<string>): void {
  const patterns = [
    /https?:\/\/shop\.tiktok\.com[^"'}\s<>]*/gi,
    /https?:\/\/vt\.tiktok\.com\/[a-zA-Z0-9/_-]+/gi,
    /https?:\/\/vm\.tiktok\.com\/[a-zA-Z0-9/_-]+/gi,
    /https?:\/\/www\.tiktok\.com\/t\/[a-zA-Z0-9/_-]+/gi,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const u = safeUrl(m[0].replace(/[,).;]+$/, ""));
      if (u) bucket.add(u.split("#")[0] ?? u);
    }
  }
}

function collectUrlFieldsDeep(n: unknown, bucket: Set<string>, maxNodes = 1200): void {
  const seen = new WeakSet<object>();
  let nodes = 0;
  const walk = (v: unknown) => {
    if (nodes >= maxNodes) return;
    nodes++;
    if (typeof v === "string") {
      collectUrlsFromString(v, bucket);
      return;
    }
    if (!v || typeof v !== "object") return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    const r = v as Record<string, unknown>;
    for (const [k, x] of Object.entries(r)) {
      if (k === "url" || k === "href" || k === "link" || k === "webLink") {
        if (typeof x === "string") collectUrlsFromString(x, bucket);
      }
      walk(x);
    }
  };
  walk(n);
}

function findItemModule(root: unknown): Record<string, unknown> | null {
  const seen = new WeakSet<object>();
  const walk = (n: unknown): Record<string, unknown> | null => {
    if (!n || typeof n !== "object") return null;
    if (seen.has(n as object)) return null;
    seen.add(n as object);
    if (!Array.isArray(n) && "ItemModule" in n) {
      const im = (n as { ItemModule: unknown }).ItemModule;
      if (im && typeof im === "object" && !Array.isArray(im)) {
        return im as Record<string, unknown>;
      }
    }
    if (Array.isArray(n)) {
      for (const x of n) {
        const r = walk(x);
        if (r) return r;
      }
      return null;
    }
    for (const v of Object.values(n)) {
      const r = walk(v);
      if (r) return r;
    }
    return null;
  };
  return walk(root);
}

function findUserModule(root: unknown): Record<string, unknown> | null {
  const seen = new WeakSet<object>();
  const walk = (n: unknown): Record<string, unknown> | null => {
    if (!n || typeof n !== "object") return null;
    if (seen.has(n as object)) return null;
    seen.add(n as object);
    if (!Array.isArray(n) && "UserModule" in n) {
      const um = (n as { UserModule: unknown }).UserModule;
      if (um && typeof um === "object" && !Array.isArray(um)) {
        return um as Record<string, unknown>;
      }
    }
    if (Array.isArray(n)) {
      for (const x of n) {
        const r = walk(x);
        if (r) return r;
      }
      return null;
    }
    for (const v of Object.values(n)) {
      const r = walk(v);
      if (r) return r;
    }
    return null;
  };
  return walk(root);
}

function parseUniversalData(html: string): unknown | null {
  const m = html.match(
    /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]*)<\/script>/i
  );
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; MulifyLibrary/1.0; +https://example.invalid) AppleWebKit/537.36",
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a public TikTok profile and normalize videos + outbound links.
 */
export async function fetchTikTokPageSnapshot(params: {
  pageUrl?: string | null;
  handle?: string | null;
  timeoutMs?: number;
}): Promise<TikTokFetchResult> {
  const empty = (): TikTokFetchResult => ({
    profileHandle: null,
    profileUrl: null,
    videos: [],
    outboundLinks: [],
    metrics: { videosFetched: 0, outboundLinksFound: 0 },
  });

  const handle = resolveTikTokProfileHandle(params);
  const profileUrl = handle ? buildTikTokProfileUrl(handle) : params.pageUrl?.trim() || null;
  if (!profileUrl) return empty();

  const timeoutMs = params.timeoutMs ?? 18_000;
  const html = await fetchHtml(profileUrl, timeoutMs);
  if (!html) {
    return {
      profileHandle: handle,
      profileUrl,
      videos: [],
      outboundLinks: [],
      metrics: { videosFetched: 0, outboundLinksFound: 0 },
    };
  }

  const outbound = new Set<string>();
  collectUrlsFromString(html, outbound);
  collectTikTokCommerceHints(html, outbound);

  const videoIds = new Set<string>();
  const vidRe = /\/video\/(\d{8,})/g;
  let vm: RegExpExecArray | null;
  while ((vm = vidRe.exec(html)) !== null) {
    videoIds.add(vm[1]!);
  }

  const parsed = parseUniversalData(html);
  const videos: TikTokVideoNormalized[] = [];
  const effectiveHandle = handle ?? null;

  if (parsed) {
    collectUrlsFromString(JSON.stringify(parsed), outbound);
    // Pinned posts, shop links, duet/stitch outbounds, and "webLink" fields often live outside captions.
    collectUrlFieldsDeep(parsed, outbound, 1400);

    const um = findUserModule(parsed);
    if (um && "users" in um) {
      const users = asRecord(um.users);
      if (users) {
        for (const u of Object.values(users)) {
          const ur = asRecord(u);
          if (!ur) continue;
          const sig = typeof ur.signature === "string" ? ur.signature : "";
          if (sig) collectUrlsFromString(sig, outbound);
          const bio = asRecord(ur.bioLink);
          const link = bio && typeof bio.link === "string" ? safeUrl(bio.link) : null;
          if (link) outbound.add(link);
        }
      }
    }

    const im = findItemModule(parsed);
    if (im && effectiveHandle) {
      for (const item of Object.values(im)) {
        const row = asRecord(item);
        if (!row) continue;
        const id = typeof row.id === "string" ? row.id : undefined;
        if (!id || !/^\d+$/.test(id)) continue;
        videoIds.add(id);
        const desc = typeof row.desc === "string" ? row.desc : undefined;
        const vid = asRecord(row.video);
        let thumb: string | undefined;
        if (vid) {
          if (typeof vid.cover === "string") thumb = vid.cover;
          else if (typeof vid.originCover === "string") thumb = vid.originCover;
          collectUrlsFromString(JSON.stringify(vid), outbound);
        }
        const music = asRecord(row.music) ?? asRecord(row.musicInfo) ?? null;
        const musicId = music ? (typeof music.id === "string" ? music.id : typeof music.musicId === "string" ? music.musicId : undefined) : undefined;
        const musicTitle = music ? (typeof music.title === "string" ? music.title : typeof music.name === "string" ? music.name : undefined) : undefined;
        if (Array.isArray(row.textExtra)) {
          collectUrlsFromString(JSON.stringify(row.textExtra), outbound);
        }
        if (row.stitch) collectUrlsFromString(JSON.stringify(row.stitch), outbound);
        if (row.duetInfo) collectUrlsFromString(JSON.stringify(row.duetInfo), outbound);
        const creativeUrl = `https://www.tiktok.com/@${effectiveHandle}/video/${id}`;
        let outboundUrl: string | undefined;
        if (desc) collectUrlsFromString(desc, outbound);
        const descUrl = desc?.match(/https?:\/\/[^\s]+/i)?.[0];
        if (descUrl) {
          const normalized = safeUrl(descUrl.replace(/[),.;]+$/, ""));
          if (normalized) outboundUrl = normalized;
        }
        videos.push({
          videoId: id,
          creativeUrl,
          thumbnailUrl: thumb,
          caption: desc,
          outboundUrl,
          musicId,
          musicTitle,
          hookPhrase: hookPhraseFromCaption(desc) ?? undefined,
          hashtags: hashtagsFromCaption(desc, 10),
        });
      }
    }
  }

  const hFinal = effectiveHandle ?? resolveTikTokProfileHandle({ pageUrl: profileUrl });
  if (hFinal) {
    for (const id of videoIds) {
      if (videos.some((v) => v.videoId === id)) continue;
      videos.push({
        videoId: id,
        creativeUrl: `https://www.tiktok.com/@${hFinal}/video/${id}`,
      });
    }
  }

  const outboundLinks = [...outbound];
  return {
    profileHandle: hFinal,
    profileUrl,
    videos,
    outboundLinks,
    metrics: {
      videosFetched: videos.length,
      outboundLinksFound: outboundLinks.length,
    },
  };
}

export function hashLandingExternalId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 24);
}
