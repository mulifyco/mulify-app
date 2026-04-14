import { NextResponse } from "next/server";

/**
 * Short private cache for authenticated read-heavy JSON APIs (browser SWR-style).
 * Pairs with server `unstable_cache` in `lib/perf/cached-server-data.ts` (similar TTL).
 */
export const PRIVATE_READ_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=15, stale-while-revalidate=120",
} as const;

export const READ_CACHE_MAX_AGE_SEC = 15;

export function jsonWithReadCache<T>(body: T, init?: ResponseInit): NextResponse<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", PRIVATE_READ_CACHE_HEADERS["Cache-Control"]);
  }
  return NextResponse.json(body, { ...init, headers });
}
