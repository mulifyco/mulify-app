/** UTC midnight for a calendar day (snapshot bucketing). */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export type TimelineRangeParsed = { from: Date; to: Date; rangeKey: string };

/**
 * Supports range=24h|7d|30d|90d or custom from/to (ISO date strings).
 * Snapshot data is daily; short windows may return sparse points.
 */
export function parseTimelineRange(searchParams: URLSearchParams): TimelineRangeParsed {
  const range = (searchParams.get("range") ?? "").toLowerCase().trim();
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");

  const end = toRaw ? new Date(toRaw) : new Date();
  if (Number.isNaN(end.getTime())) {
    const now = new Date();
    return { from: utcDayStart(new Date(now.getTime() - 30 * 86400000)), to: now, rangeKey: "30d" };
  }

  let start: Date;
  if (fromRaw) {
    start = new Date(fromRaw);
    if (Number.isNaN(start.getTime())) {
      start = new Date(end.getTime() - 30 * 86400000);
    }
  } else if (range === "24h" || range === "1d") {
    start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  } else if (range === "7d") {
    start = new Date(end.getTime() - 7 * 86400000);
  } else if (range === "30d") {
    start = new Date(end.getTime() - 30 * 86400000);
  } else if (range === "90d") {
    start = new Date(end.getTime() - 90 * 86400000);
  } else {
    start = new Date(end.getTime() - 30 * 86400000);
  }

  return { from: start, to: end, rangeKey: range || (fromRaw || toRaw ? "custom" : "30d") };
}
