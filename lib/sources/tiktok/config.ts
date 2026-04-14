import type { AdapterRuntimeConfigBase } from "@/lib/sources/shared/types";

export type TikTokResolvedConfig = {
  profileUrl: string;
  handle: string | null;
  pageUrl: string | null;
  timeoutMs: number;
};

function readTimeoutMs(config: unknown): number {
  if (!config || typeof config !== "object") return 18_000;
  const c = config as Record<string, unknown>;
  const n = typeof c.timeoutMs === "number" ? c.timeoutMs : Number(c.timeoutMs);
  if (Number.isFinite(n) && n >= 3000 && n <= 120_000) return Math.floor(n);
  return 18_000;
}

export function resolveTikTokPageConfig(base: AdapterRuntimeConfigBase): TikTokResolvedConfig {
  const rowUrl = base.sourceConfigJson && typeof base.sourceConfigJson === "object"
    ? String((base.sourceConfigJson as Record<string, unknown>).pageUrl ?? "").trim()
    : "";
  const colUrl = base.sourcePageUrl?.trim() ?? "";
  const effectivePage = colUrl || rowUrl || null;

  const cfg = base.sourceConfigJson && typeof base.sourceConfigJson === "object"
    ? (base.sourceConfigJson as Record<string, unknown>)
    : {};
  const cfgHandle = typeof cfg.handle === "string" ? cfg.handle.trim() : "";

  let handle: string | null = null;
  if (cfgHandle) handle = cfgHandle.replace(/^@+/, "") || null;
  if (!handle && effectivePage) {
    try {
      const u = new URL(effectivePage.includes("://") ? effectivePage : `https://${effectivePage}`);
      const m = u.pathname.match(/@([^/?#]+)/);
      if (m?.[1]) handle = m[1].replace(/^@+/, "") || null;
    } catch {
      /* ignore */
    }
  }

  const profileUrl =
    effectivePage && effectivePage.includes("tiktok.com")
      ? effectivePage.includes("://")
        ? effectivePage
        : `https://${effectivePage}`
      : handle
        ? `https://www.tiktok.com/@${handle}`
        : null;

  if (!profileUrl) {
    throw new Error(
      "TikTok source needs pageUrl (full profile URL) or config.handle — e.g. https://www.tiktok.com/@brand"
    );
  }

  return {
    profileUrl,
    handle,
    pageUrl: effectivePage,
    timeoutMs: readTimeoutMs(base.sourceConfigJson),
  };
}
