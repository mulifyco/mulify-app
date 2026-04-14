"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import OfferAnalyzerDrawer from "@/components/internal/OfferAnalyzerDrawer";
import PersonaAnalyzerDrawer from "@/components/internal/PersonaAnalyzerDrawer";
import AddAsLeadButton from "@/components/internal/AddAsLeadButton";
import LoadDemoWorkspaceButton from "@/components/launch/LoadDemoWorkspaceButton";

type CompareResponse = {
  requested: { domains: string[]; storeIds: string[] };
  stores: Array<{
    domain: string;
    storeId: string | null;
    name: string | null;
    lastSeenAt: string | Date | null;
    trendScore: number;
    totalProducts: number;
    totalCollections: number;
    linkedProductClusterCount: number;
    linkedCreativeClusterCount: number;
    avgReadyToScaleScore: number | null;
    avgMarketLeaderScore: number | null;
    avgEarlyMoverScore: number | null;
    avgSaturatedScore: number | null;
    readyToScaleCount: number;
    earlyMoverCount: number;
    saturatedCount: number;
    topProductClusters: any[];
    topCreativeClusters: any[];
    timeline7d?: {
      deltaTraffic: number | null;
      deltaProductClusters: number | null;
      deltaCreativeClusters: number | null;
      momentum: "up" | "down" | "flat" | "unknown";
    };
  }>;
  aggregates: { avgTrend: number; avgSaturation: number | null; latestSeenAt: string | Date | null };
  missing: Array<{ key: string; reason: string }>;
};

type WatchlistRow = { id: string; name: string };

function uniq(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}

function toDomainsCsv(domains: string[]): string {
  return domains.map((d) => d.trim()).filter(Boolean).join(",");
}

function metricPill(label: string, value: string, variant: "default" | "green" | "yellow" | "red" | "purple" = "default") {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.14em]">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${variant === "red" ? "text-red-600" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

export default function CompareClient({
  initialDomains,
  initialStoreIds,
}: {
  initialDomains: string[];
  initialStoreIds: string[];
}) {
  const [domains, setDomains] = useState<string[]>(uniq(initialDomains));
  const [input, setInput] = useState("");
  const [watchlists, setWatchlists] = useState<WatchlistRow[]>([]);
  const [watchlistId, setWatchlistId] = useState<string>("");

  const [data, setData] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryHref = useMemo(() => {
    const d = toDomainsCsv(domains);
    return d ? `/compare?domains=${encodeURIComponent(d)}` : "/compare";
  }, [domains]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/watchlists?pageSize=200", { cache: "no-store" });
        const json = (await res.json()) as { data?: Array<{ id: string; name: string }> };
        const wl = Array.isArray(json.data) ? json.data.map((x) => ({ id: x.id, name: x.name })) : [];
        setWatchlists(wl);
        if (wl[0]?.id) setWatchlistId(wl[0].id);
      } catch {
        setWatchlists([]);
      }
    })();
  }, []);

  async function loadFromWatchlist() {
    if (!watchlistId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}`, { cache: "no-store" });
      const json = (await res.json()) as { watchlist?: { stores?: Array<{ domain: string }> }; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to load watchlist");
        return;
      }
      const d = uniq((json.watchlist?.stores ?? []).map((s) => s.domain)).slice(0, 20);
      setDomains(d);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function runCompare(nextDomains: string[]) {
    const d = uniq(nextDomains).slice(0, 20);
    if (d.length === 0 && initialStoreIds.length === 0) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (d.length) qs.set("domains", d.join(","));
      if (initialStoreIds.length) qs.set("storeIds", initialStoreIds.join(","));
      const res = await fetch(`/api/compare/stores?${qs.toString()}`, { cache: "no-store" });
      const raw = await res.text();
      let json: unknown = null;
      try {
        json = raw ? JSON.parse(raw) : null;
      } catch {
        setError("Could not read compare response. Try again.");
        return;
      }
      const body = json as { error?: string; code?: string; stores?: CompareResponse["stores"] };
      if (!res.ok) {
        const base = body.error ?? "Compare failed";
        setError(body.code === "PAYWALL" ? `${base} — open Pricing for upgrade options.` : base);
        return;
      }
      if (body && typeof body === "object" && Array.isArray(body.stores)) {
        setData(body as CompareResponse);
      } else {
        setError("Unexpected compare payload — partial data unavailable.");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (domains.length || initialStoreIds.length) {
      runCompare(domains);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFromInput() {
    const parts = input
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = uniq([...domains, ...parts]).slice(0, 20);
    setDomains(next);
    setInput("");
    runCompare(next);
  }

  function removeDomain(d: string) {
    const next = domains.filter((x) => x !== d);
    setDomains(next);
    runCompare(next);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm md:static sticky top-14 z-20 bg-card/95 backdrop-blur-sm md:bg-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2 min-w-0 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-none sm:max-w-md">
              <span className="text-[11px] text-muted">Add domain(s)</span>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="example.com, competitor.com"
                className="w-full min-w-0 sm:w-80 bg-surface border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
              />
            </label>
            <button
              type="button"
              onClick={addFromInput}
              disabled={loading || !input.trim()}
              className="px-3 py-1.5 text-xs bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded text-primary-foreground border border-border shadow-sm"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => runCompare(domains)}
              disabled={loading || (domains.length === 0 && initialStoreIds.length === 0)}
              className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm disabled:opacity-40"
            >
              {loading ? "Comparing…" : "Run compare"}
            </button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="flex flex-col gap-1 min-w-0 flex-1 sm:flex-none">
              <span className="text-[11px] text-muted">Load from watchlist</span>
              <select
                value={watchlistId}
                onChange={(e) => setWatchlistId(e.target.value)}
                className="w-full min-w-0 sm:min-w-[14rem] bg-surface border border-border rounded px-2 py-1.5 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
              >
                {watchlists.length === 0 ? <option value="">No watchlists</option> : null}
                {watchlists.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={loadFromWatchlist}
              disabled={loading || !watchlistId}
              className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm disabled:opacity-40"
            >
              Load
            </button>
            <Link href={queryHref} className="text-xs text-muted hover:opacity-80">
              Share link →
            </Link>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {domains.map((d) => (
            <span key={d} className="inline-flex items-center gap-2 px-2 py-1 rounded border border-border bg-surface text-xs">
              <span className="font-mono text-foreground">{d}</span>
              <button type="button" onClick={() => removeDomain(d)} className="text-muted hover:opacity-80">
                ×
              </button>
            </span>
          ))}
          {domains.length === 0 ? (
            <span className="text-xs text-muted inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              Add 2+ domains to compare.
              <LoadDemoWorkspaceButton
                label="Load demo watchlist"
                className="px-2 py-0.5 text-[11px] rounded border border-indigo-500/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
              />
              <Link
                href="/compare?domains=sample-brand-a.demo,sample-brand-b.demo"
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Try sample domains
              </Link>
            </span>
          ) : null}
        </div>

        {error ? <div className="mt-3 text-xs text-red-600">{error}</div> : null}
        {data?.missing?.length ? (
          <div className="mt-3 text-xs text-amber-600">
            Missing: {data.missing.map((m) => `${m.key} (${m.reason})`).join(", ")}
          </div>
        ) : null}
      </div>

      {data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metricPill("Stores compared", String(data.stores.length), "default")}
            {metricPill("Avg trend", String(data.aggregates.avgTrend), "default")}
            {metricPill(
              "Latest seen",
              data.aggregates.latestSeenAt ? new Date(data.aggregates.latestSeenAt as any).toLocaleString() : "—",
              "default"
            )}
            {metricPill("Partial/missing", String(data.missing.length), data.missing.length ? "yellow" : "default")}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {data.stores.map((s) => (
              <div key={s.domain} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">{s.domain}</div>
                    <div className="text-xs text-muted mt-0.5">{s.name ?? "—"}</div>
                    {s.storeId ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <OfferAnalyzerDrawer
                          entityType="STORE"
                          entityId={s.storeId}
                          triggerLabel="Offer"
                          title={`Offer audit · ${s.domain}`}
                        />
                        <span>
                          <PersonaAnalyzerDrawer
                            entityType="STORE"
                            entityId={s.storeId}
                            triggerLabel="Persona"
                            title={`Persona · ${s.domain}`}
                          />
                        </span>
                        <span>
                          <AddAsLeadButton
                            domain={s.domain}
                            storeId={s.storeId}
                            companyName={s.name}
                            tags={["from_compare"]}
                          />
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <a
                    href={`https://${s.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted hover:opacity-80"
                  >
                    Visit ↗
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div className="rounded border border-border px-3 py-2">
                    <div className="text-[10px] text-muted uppercase">Trend</div>
                    <div className="font-semibold tabular-nums">{s.trendScore}</div>
                  </div>
                  <div className="rounded border border-border px-3 py-2">
                    <div className="text-[10px] text-muted uppercase">Clusters</div>
                    <div className="font-semibold tabular-nums">
                      PC {s.linkedProductClusterCount} · CC {s.linkedCreativeClusterCount}
                    </div>
                  </div>
                  <div className="rounded border border-border px-3 py-2">
                    <div className="text-[10px] text-muted uppercase">Catalog</div>
                    <div className="font-semibold tabular-nums">
                      {s.totalProducts} products · {s.totalCollections} col
                    </div>
                  </div>
                  <div className="rounded border border-border px-3 py-2">
                    <div className="text-[10px] text-muted uppercase">Signals</div>
                    <div className="font-semibold tabular-nums">
                      RTS {s.readyToScaleCount} · EM {s.earlyMoverCount} · SAT {s.saturatedCount}
                    </div>
                  </div>
                  <div className="text-right">
                    {s.topProductClusters?.[0]?.clusterId ? (
                      <ExplainDrawer
                        entityType="PRODUCT_CLUSTER"
                        entityId={s.topProductClusters[0].clusterId}
                        triggerLabel="Explain strength"
                        title={`Top product signal · ${s.domain}`}
                      />
                    ) : s.topCreativeClusters?.[0]?.clusterId ? (
                      <ExplainDrawer
                        entityType="CREATIVE_CLUSTER"
                        entityId={s.topCreativeClusters[0].clusterId}
                        triggerLabel="Explain strength"
                        title={`Top creative signal · ${s.domain}`}
                      />
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge label={`avg RTS ${s.avgReadyToScaleScore ?? "—"}`} variant="purple" />
                  <Badge label={`avg EM ${s.avgEarlyMoverScore ?? "—"}`} variant="blue" />
                  <Badge label={`avg SAT ${s.avgSaturatedScore ?? "—"}`} variant="yellow" />
                  {s.timeline7d ? (
                    <Badge
                      label={`7d ${s.timeline7d.momentum}`}
                      variant={
                        s.timeline7d.momentum === "up"
                          ? "green"
                          : s.timeline7d.momentum === "down"
                            ? "red"
                            : "default"
                      }
                    />
                  ) : null}
                </div>
                {s.timeline7d ? (
                  <div className="mt-2 text-[11px] text-muted tabular-nums space-y-0.5">
                    <div>
                      Δ traffic (7d):{" "}
                      {s.timeline7d.deltaTraffic == null ? "—" : s.timeline7d.deltaTraffic > 0 ? `+${s.timeline7d.deltaTraffic}` : s.timeline7d.deltaTraffic}
                    </div>
                    <div>
                      Δ product clusters:{" "}
                      {s.timeline7d.deltaProductClusters == null
                        ? "—"
                        : s.timeline7d.deltaProductClusters > 0
                          ? `+${s.timeline7d.deltaProductClusters}`
                          : s.timeline7d.deltaProductClusters}
                    </div>
                    <div>
                      Δ creative clusters:{" "}
                      {s.timeline7d.deltaCreativeClusters == null
                        ? "—"
                        : s.timeline7d.deltaCreativeClusters > 0
                          ? `+${s.timeline7d.deltaCreativeClusters}`
                          : s.timeline7d.deltaCreativeClusters}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">
                      Top product clusters
                    </div>
                    {s.topProductClusters?.length ? (
                      <ul className="space-y-1">
                        {s.topProductClusters.map((c: any) => (
                          <li key={c.id} className="flex items-center justify-between gap-2">
                            <a href={`/product-clusters/${c.id}`} className="text-xs text-foreground hover:opacity-80 truncate">
                              {c.title ?? c.key}
                            </a>
                            <span className="text-[11px] text-muted tabular-nums">{c.winningScore}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-muted">—</div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">
                      Top creative clusters
                    </div>
                    {s.topCreativeClusters?.length ? (
                      <ul className="space-y-1">
                        {s.topCreativeClusters.map((c: any) => (
                          <li key={c.id} className="flex items-center justify-between gap-2">
                            <a href={`/boards/creative-winners`} className="text-xs text-foreground hover:opacity-80 truncate">
                              {String(c.fingerprint ?? c.id).slice(0, 24)}
                            </a>
                            <span className="text-[11px] text-muted tabular-nums">{c.scaleScore}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-muted">—</div>
                    )}
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-muted-2">
                  Last seen: {s.lastSeenAt ? new Date(s.lastSeenAt as any).toLocaleString() : "—"}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">No comparison yet</p>
          <p className="text-xs text-muted mt-2 max-w-md mx-auto">
            Add two or more domains, or load a watchlist, then run compare. Partial results are shown if some stores are missing.
          </p>
        </div>
      )}
    </div>
  );
}

