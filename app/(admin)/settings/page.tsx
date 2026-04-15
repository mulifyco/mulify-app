import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import { sourceDb } from "@/lib/prisma-source-delegate";
import { getConfig, shouldMockAllSourceApis, shouldMockMetaAdsApis } from "@/config";
import { statusBadge } from "@/components/ui/Badge";
import Link from "next/link";
import { getEnvChecks } from "@/lib/env";

export const dynamic = "force-dynamic";

type SettingsSourceRow = { id: string; name: string; type: string; status: string };

export default async function SettingsPage() {
  const [sourceCount, jobCount, rawRecordCount, sourcesRaw] = await Promise.all([
    sourceDb().count(),
    prisma.ingestionJob.count(),
    prisma.rawRecord.count(),
    sourceDb().findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);
  const sources = sourcesRaw as SettingsSourceRow[];

  let cfg: ReturnType<typeof getConfig> | null = null;
  try {
    cfg = getConfig();
  } catch {
    cfg = null;
  }

  const mockAll = cfg ? shouldMockAllSourceApis() : false;
  const mockMetaHeuristic = cfg ? shouldMockMetaAdsApis() : false;
  const envChecks = getEnvChecks();
  const missingCritical = envChecks.filter((c) => c.level === "red").map((c) => c.key);
  const providerMetaReady = Boolean(process.env.META_ACCESS_TOKEN?.trim()) && process.env.NODE_ENV === "production";
  const providerShopifyReady = Boolean(process.env.SHOPIFY_TARGET_DOMAINS?.trim());
  const providerTikTokReady = true; // no official token; relies on public HTML best-effort

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Environment summary, ingestion defaults, and operational mode"
      />

      <div className="space-y-6 max-w-3xl">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Team & workspaces</h2>
            <p className="text-xs text-muted-2 mt-1 max-w-md">
              Invites, roles, seat limits, and switching the active workspace for billing context.
            </p>
          </div>
          <Link
            href="/settings/team"
            className="shrink-0 inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2 transition-colors"
          >
            Open team settings →
          </Link>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Runtime mode</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex gap-4">
              <dt className="w-40 text-muted-2 shrink-0">NODE_ENV</dt>
              <dd className="text-foreground">{process.env.NODE_ENV}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-40 text-muted-2 shrink-0">LIBRARY_MOCK_SOURCE_APIS</dt>
              <dd className="text-foreground">
                {mockAll ? (
                  <span className="text-amber-600">true — fixtures enabled (non-production only)</span>
                ) : (
                  <span className="text-muted">false / unset — live adapters when configured</span>
                )}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-40 text-muted-2 shrink-0">Meta mock heuristic</dt>
              <dd className="text-foreground text-xs leading-relaxed">
                {mockMetaHeuristic
                  ? "Meta adapter will use mock data (explicit flag, or dev without META_ACCESS_TOKEN)."
                  : "Meta adapter expects META_ACCESS_TOKEN for live Ad Library calls."}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-40 text-muted-2 shrink-0">Shopify</dt>
              <dd className="text-foreground text-xs leading-relaxed">
                Public storefront JSON only. Set SHOPIFY_TARGET_DOMAINS for live crawls; otherwise use
                LIBRARY_MOCK_SOURCE_APIS for offline fixtures.
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Provider readiness</h2>
          <p className="text-xs text-muted-2 mb-3">No secrets shown. Readiness is best-effort.</p>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-foreground font-medium">Meta Ad Library</div>
                <div className="text-xs text-muted-2">Requires `META_ACCESS_TOKEN` in production.</div>
              </div>
              {statusBadge(providerMetaReady ? "ACTIVE" : "ERROR")}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-foreground font-medium">TikTok (public profile HTML)</div>
                <div className="text-xs text-muted-2">No token; can be throttled/blocked. Uses timeout + retry.</div>
              </div>
              {statusBadge(providerTikTokReady ? "ACTIVE" : "ERROR")}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-foreground font-medium">Shopify storefront extraction</div>
                <div className="text-xs text-muted-2">Best results when `SHOPIFY_TARGET_DOMAINS` is set.</div>
              </div>
              {statusBadge(providerShopifyReady ? "ACTIVE" : "PENDING")}
            </div>
            {missingCritical.length ? (
              <div className="mt-3 text-xs text-red-600">
                Missing production-critical env: {missingCritical.slice(0, 8).join(", ")}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Configured sources</h2>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-2">No sources in database. Seed or add under Sources.</p>
          ) : (
            <ul className="divide-y divide-border border border-border rounded-md overflow-hidden">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-card text-sm"
                >
                  <div className="min-w-0">
                    <Link href={`/sources/${s.id}`} className="text-foreground hover:opacity-80 font-medium">
                      {s.name}
                    </Link>
                    <div className="text-[11px] text-muted-2 font-mono">{s.type}</div>
                  </div>
                  {statusBadge(s.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">System counts</h2>
          <dl className="space-y-3 text-sm">
            {[
              ["Platform", "library.mulify.co"],
              ["Phase", "Phase 1 — internal ops UI"],
              ["Sources", sourceCount],
              ["Ingestion jobs (all time)", jobCount],
              ["Raw records", rawRecordCount.toLocaleString()],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex gap-4">
                <dt className="w-40 text-muted-2">{label}</dt>
                <dd className="text-foreground">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Ingestion defaults</h2>
          <dl className="space-y-3 text-sm text-muted">
            <div className="flex gap-4">
              <dt className="w-48 text-muted-2 shrink-0">MAX_CONCURRENT_JOBS</dt>
              <dd>{cfg?.MAX_CONCURRENT_JOBS ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-48 text-muted-2 shrink-0">JOB_TIMEOUT_MS</dt>
              <dd>{cfg?.JOB_TIMEOUT_MS?.toLocaleString() ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-48 text-muted-2 shrink-0">META_REQUESTS_PER_HOUR</dt>
              <dd>{cfg?.META_REQUESTS_PER_HOUR ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-48 text-muted-2 shrink-0">SHOPIFY_REQUESTS_PER_MINUTE</dt>
              <dd>{cfg?.SHOPIFY_REQUESTS_PER_MINUTE ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Secrets & connectivity</h2>
          <p className="text-xs text-muted-2 mb-3">
            Values are masked. Fix missing items before live ingestion.
          </p>
          <div className="space-y-2 text-xs font-mono">
            {[
              ["DATABASE_URL", cfg ? "configured" : "invalid / not loaded"],
              ["NEXTAUTH_SECRET", process.env.NEXTAUTH_SECRET ? "set ✓" : "MISSING ✗"],
              ["ADMIN_EMAIL", process.env.ADMIN_EMAIL ?? "admin@mulify.co"],
              ["ADMIN_PASSWORD", process.env.ADMIN_PASSWORD ? "set ✓" : "MISSING ✗"],
              ["META_ACCESS_TOKEN", process.env.META_ACCESS_TOKEN ? "set ✓" : "not set"],
              ["SHOPIFY_TARGET_DOMAINS", process.env.SHOPIFY_TARGET_DOMAINS ? "set ✓" : "not set"],
            ].map(([key, value]) => (
              <div key={String(key)} className="flex gap-4">
                <span className="w-52 text-muted shrink-0">{key}</span>
                <span
                  className={
                    String(value).includes("MISSING")
                      ? "text-red-600"
                      : String(value).includes("✓")
                        ? "text-emerald-600"
                        : "text-muted"
                  }
                >
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Feature flags</h2>
          <p className="text-sm text-muted-2">
            No feature flags wired in Phase 1. Phase 2 may add toggles for crawling, enrichment, and
            clustering without redeploying schema.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4">Roadmap</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex gap-3">
              <span className="text-emerald-600">✓</span>
              <span className="text-foreground">Phase 1: ingestion, normalization, admin inspection UI</span>
            </li>
            <li className="flex gap-3">
              <span className="text-muted-2">○</span>
              <span>Phase 2: landing crawl depth, advanced scoring, clustering, AI enrichment</span>
            </li>
            <li className="flex gap-3">
              <span className="text-muted-2">○</span>
              <span>Phase 3: alerts, trends, API access, team RBAC</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
