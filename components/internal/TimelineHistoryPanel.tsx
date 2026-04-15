"use client";

import { useEffect, useMemo, useState } from "react";

type Point = Record<string, unknown>;

export default function TimelineHistoryPanel({
  apiUrl,
  title,
  valueKeys,
}: {
  apiUrl: string;
  title: string;
  /** Keys on each point to show (first used for sparkline height). */
  valueKeys: string[];
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const url = useMemo(() => {
    const sep = apiUrl.includes("?") ? "&" : "?";
    return `${apiUrl}${sep}range=30d`;
  }, [apiUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { points?: Point[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? "Failed to load timeline");
        if (!cancelled) setPoints(Array.isArray(j.points) ? j.points : []);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const primaryKey = valueKeys[0] ?? "value";
  const nums = points.map((p) => Number(p[primaryKey] ?? 0)).filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums.map((n) => Math.abs(n)), 1) : 1;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{title}</h3>
      {loading ? <p className="text-sm text-muted">Loading history…</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {!loading && !err && points.length === 0 ? (
        <p className="text-sm text-muted">
          No daily snapshots yet. They are created at the end of each worker tick after clusters and scores are refreshed.
        </p>
      ) : null}
      {!loading && !err && points.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-end gap-0.5 h-16" title="Relative strength over time (daily)">
            {points.map((p, i) => {
              const v = Number(p[primaryKey] ?? 0);
              const px = Math.max(4, Math.round((Math.abs(v) / max) * 56));
              return (
                <div
                  key={i}
                  className="flex-1 min-w-[3px] max-w-[8px] rounded-sm bg-indigo-500/70 dark:bg-indigo-400/60"
                  style={{ height: `${px}px` }}
                />
              );
            })}
          </div>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] text-muted uppercase border-b border-border">
                  <th className="py-1 pr-2">Date</th>
                  {valueKeys.map((k) => (
                    <th key={k} className="py-1 pr-2 text-right">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {points.slice(-8).map((p, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2 text-muted whitespace-nowrap">
                      {String(p.snapshotDate ?? "").slice(0, 10)}
                    </td>
                    {valueKeys.map((k) => (
                      <td key={k} className="py-1 pr-2 text-right tabular-nums text-foreground">
                        {typeof p[k] === "number" ? (p[k] as number).toFixed(1) : String(p[k] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
