/**
 * Best-effort in-process timing samples for API routes (single-node / long-lived server).
 * Serverless instances see only their own samples.
 */

type Sample = { path: string; ms: number; at: number };

const MAX = 400;
const globalStore = globalThis as typeof globalThis & { __mulifyRouteTiming?: Sample[] };

function bucket(): Sample[] {
  if (!globalStore.__mulifyRouteTiming) globalStore.__mulifyRouteTiming = [];
  return globalStore.__mulifyRouteTiming;
}

export function recordRouteTiming(path: string, ms: number): void {
  const b = bucket();
  b.push({ path, ms, at: Date.now() });
  if (b.length > MAX) b.splice(0, b.length - MAX);
}

export async function withRouteTiming<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    recordRouteTiming(path, Date.now() - t0);
  }
}

export type RouteTimingSummary = {
  samples24h: number;
  avgMsAll24h: number;
  slowEndpoints24h: Array<{ path: string; avgMs: number; count: number }>;
  heavyBoardFetches24h: number;
};

export function getRouteTimingSummary(): RouteTimingSummary {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = bucket().filter((s) => s.at >= since);
  if (rows.length === 0) {
    return { samples24h: 0, avgMsAll24h: 0, slowEndpoints24h: [], heavyBoardFetches24h: 0 };
  }
  const avgMsAll24h = Math.round(rows.reduce((a, s) => a + s.ms, 0) / rows.length);
  const byPath = new Map<string, number[]>();
  for (const s of rows) {
    const arr = byPath.get(s.path) ?? [];
    arr.push(s.ms);
    byPath.set(s.path, arr);
  }
  const slowEndpoints24h = [...byPath.entries()]
    .map(([path, arr]) => ({
      path,
      count: arr.length,
      avgMs: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
    }))
    .filter((x) => x.avgMs >= 200)
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 12);
  const heavyBoardFetches24h = rows.filter(
    (s) => s.path.startsWith("/api/boards/") && s.ms >= 400
  ).length;
  return { samples24h: rows.length, avgMsAll24h, slowEndpoints24h, heavyBoardFetches24h };
}
