"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Digest = {
  id: string;
  createdAt: string;
  summary: any;
};

type HealthComputed = {
  score: number;
  lastActiveAt: string | null;
  components: Record<string, number>;
  stats: {
    activeBoards: number;
    savedFiltersCount: number;
    watchlistsCount: number;
    alertsTriggered7d: number;
    reportsCreated7d: number;
    compareRuns7d: number;
  };
} | null;

type Nudge = {
  id: string;
  type: string;
  title: string;
  message: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  status: "OPEN" | "DISMISSED" | "DONE";
  createdAt: string;
};

function tone(score: number): "green" | "yellow" | "red" {
  if (score >= 75) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

export default function RetentionPanel() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [health, setHealth] = useState<HealthComputed>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadAll() {
    setErr(null);
    const [d, h, n] = await Promise.all([
      fetch("/api/customer-success/digest").then((r) => r.json().catch(() => ({}))),
      fetch("/api/customer-success/health").then((r) => r.json().catch(() => ({}))),
      fetch("/api/customer-success/nudges").then((r) => r.json().catch(() => ({}))),
    ]);
    if (d?.digest) setDigest(d.digest);
    if (h?.computed) setHealth(h.computed);
    if (Array.isArray(n?.nudges)) setNudges(n.nudges);
  }

  useEffect(() => {
    void loadAll().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);

  const score = health?.score ?? null;
  const scoreTone = score != null ? tone(score) : "yellow";
  const nextSteps = useMemo(() => nudges.slice(0, 3), [nudges]);

  async function setNudgeStatus(id: string, status: "DISMISSED" | "DONE") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/customer-success/nudges/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed");
      }
      setNudges((xs) => xs.filter((x) => x.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs font-semibold text-muted uppercase tracking-wide">Retention</div>
          <div className="mt-1 text-sm text-foreground">
            {score == null ? (
              <span className="text-muted">Loading health…</span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span
                  className={
                    scoreTone === "green"
                      ? "px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold"
                      : scoreTone === "yellow"
                        ? "px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 text-xs font-semibold"
                        : "px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-300 text-xs font-semibold"
                  }
                >
                  Health {score}/100
                </span>
                <span className="text-xs text-muted">
                  boards {health?.stats.activeBoards ?? 0} · reports {health?.stats.reportsCreated7d ?? 0} · alerts{" "}
                  {health?.stats.alertsTriggered7d ?? 0}
                </span>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadAll()}
          className="px-2.5 py-1.5 text-xs rounded border border-border hover:bg-surface-2"
        >
          Refresh
        </button>
      </div>

      {err ? <div className="mt-3 text-xs text-red-600 dark:text-red-400">{err}</div> : null}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">Weekly digest</div>
          {digest?.summary ? (
            <div className="mt-2 text-sm text-foreground space-y-1">
              <div className="text-muted text-xs">
                {digest.summary.reportsCreated7d ?? 0} reports · {digest.summary.newLeads7d ?? 0} leads ·{" "}
                {digest.summary.alertsTriggered7d ?? 0} alerts
              </div>
              {Array.isArray(digest.summary.newEarlyMovers) && digest.summary.newEarlyMovers[0] ? (
                <div className="text-sm">
                  <span className="font-medium">Early mover:</span> {String(digest.summary.newEarlyMovers[0].title ?? "—")}
                </div>
              ) : (
                <div className="text-sm text-muted">No new early movers detected.</div>
              )}
              <div className="pt-1">
                <Link href="/boards" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                  Explore boards →
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-muted">Generating digest…</div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-3">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">What to do next</div>
          {nextSteps.length ? (
            <ul className="mt-2 space-y-2">
              {nextSteps.map((n) => (
                <li key={n.id} className="text-sm">
                  <div className="font-medium text-foreground">{n.title}</div>
                  <div className="text-xs text-muted mt-0.5">{n.message}</div>
                  {n.ctaUrl ? (
                    <div className="mt-1">
                      <Link href={n.ctaUrl} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                        {n.ctaLabel ?? "Open"} →
                      </Link>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-sm text-muted">No nudges right now.</div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-background p-3">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">Nudges</div>
          {nudges.length ? (
            <div className="mt-2 space-y-2">
              {nudges.slice(0, 6).map((n) => (
                <div key={n.id} className="rounded border border-border bg-card p-3">
                  <div className="text-sm font-medium text-foreground">{n.title}</div>
                  <div className="text-xs text-muted mt-1">{n.message}</div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {n.ctaUrl ? (
                      <Link
                        href={n.ctaUrl}
                        className="px-2 py-1 text-xs rounded border border-border hover:bg-surface-2"
                      >
                        {n.ctaLabel ?? "Open"}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyId === n.id}
                      onClick={() => void setNudgeStatus(n.id, "DONE")}
                      className="px-2 py-1 text-xs rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 disabled:opacity-50"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      disabled={busyId === n.id}
                      onClick={() => void setNudgeStatus(n.id, "DISMISSED")}
                      className="px-2 py-1 text-xs rounded border border-border hover:bg-surface-2 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-muted">Loading nudges…</div>
          )}
        </div>
      </div>
    </div>
  );
}

