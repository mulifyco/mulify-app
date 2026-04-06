import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import { getConfig, shouldMockAllSourceApis, shouldMockMetaAdsApis } from "@/config";
import { statusBadge } from "@/components/ui/Badge";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [sourceCount, jobCount, rawRecordCount, sources] = await Promise.all([
    prisma.source.count(),
    prisma.ingestionJob.count(),
    prisma.rawRecord.count(),
    prisma.source.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);

  let cfg: ReturnType<typeof getConfig> | null = null;
  try {
    cfg = getConfig();
  } catch {
    cfg = null;
  }

  const mockAll = cfg ? shouldMockAllSourceApis() : false;
  const mockMetaHeuristic = cfg ? shouldMockMetaAdsApis() : false;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Environment summary, ingestion defaults, and operational mode"
      />

      <div className="space-y-6 max-w-3xl">
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Runtime mode</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex gap-4">
              <dt className="w-40 text-gray-600 shrink-0">NODE_ENV</dt>
              <dd className="text-gray-300">{process.env.NODE_ENV}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-40 text-gray-600 shrink-0">LIBRARY_MOCK_SOURCE_APIS</dt>
              <dd className="text-gray-300">
                {mockAll ? (
                  <span className="text-amber-400">true — Meta + Shopify use fixtures</span>
                ) : (
                  <span className="text-gray-400">false / unset — live adapters when configured</span>
                )}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-40 text-gray-600 shrink-0">Meta mock heuristic</dt>
              <dd className="text-gray-300 text-xs leading-relaxed">
                {mockMetaHeuristic
                  ? "Meta adapter will use mock data (explicit flag, or dev without META_ACCESS_TOKEN)."
                  : "Meta adapter expects META_ACCESS_TOKEN for live Ad Library calls."}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-40 text-gray-600 shrink-0">Shopify</dt>
              <dd className="text-gray-300 text-xs leading-relaxed">
                Public storefront JSON only. Set SHOPIFY_TARGET_DOMAINS for live crawls; otherwise use
                LIBRARY_MOCK_SOURCE_APIS for offline fixtures.
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Configured sources</h2>
          {sources.length === 0 ? (
            <p className="text-sm text-gray-600">No sources in database. Seed or add under Sources.</p>
          ) : (
            <ul className="divide-y divide-gray-800/80 border border-gray-800 rounded-md overflow-hidden">
              {sources.map((s: (typeof sources)[number]) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-gray-950/50 text-sm"
                >
                  <div className="min-w-0">
                    <Link href={`/sources/${s.id}`} className="text-gray-200 hover:text-white font-medium">
                      {s.name}
                    </Link>
                    <div className="text-[11px] text-gray-600 font-mono">{s.type}</div>
                  </div>
                  {statusBadge(s.status)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">System counts</h2>
          <dl className="space-y-3 text-sm">
            {[
              ["Platform", "library.mulify.co"],
              ["Phase", "Phase 1 — internal ops UI"],
              ["Sources", sourceCount],
              ["Ingestion jobs (all time)", jobCount],
              ["Raw records", rawRecordCount.toLocaleString()],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex gap-4">
                <dt className="w-40 text-gray-600">{label}</dt>
                <dd className="text-gray-300">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Ingestion defaults</h2>
          <dl className="space-y-3 text-sm text-gray-400">
            <div className="flex gap-4">
              <dt className="w-48 text-gray-600 shrink-0">MAX_CONCURRENT_JOBS</dt>
              <dd>{cfg?.MAX_CONCURRENT_JOBS ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-48 text-gray-600 shrink-0">JOB_TIMEOUT_MS</dt>
              <dd>{cfg?.JOB_TIMEOUT_MS?.toLocaleString() ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-48 text-gray-600 shrink-0">META_REQUESTS_PER_HOUR</dt>
              <dd>{cfg?.META_REQUESTS_PER_HOUR ?? "—"}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-48 text-gray-600 shrink-0">SHOPIFY_REQUESTS_PER_MINUTE</dt>
              <dd>{cfg?.SHOPIFY_REQUESTS_PER_MINUTE ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Secrets & connectivity</h2>
          <p className="text-xs text-gray-600 mb-3">
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
                <span className="w-52 text-gray-500 shrink-0">{key}</span>
                <span
                  className={
                    String(value).includes("MISSING")
                      ? "text-red-400"
                      : String(value).includes("✓")
                        ? "text-emerald-400"
                        : "text-gray-400"
                  }
                >
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Feature flags</h2>
          <p className="text-sm text-gray-600">
            No feature flags wired in Phase 1. Phase 2 may add toggles for crawling, enrichment, and
            clustering without redeploying schema.
          </p>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Roadmap</h2>
          <ul className="space-y-2 text-sm text-gray-500">
            <li className="flex gap-3">
              <span className="text-emerald-400">✓</span>
              <span>Phase 1: ingestion, normalization, admin inspection UI</span>
            </li>
            <li className="flex gap-3">
              <span className="text-gray-700">○</span>
              <span>Phase 2: landing crawl depth, advanced scoring, clustering, AI enrichment</span>
            </li>
            <li className="flex gap-3">
              <span className="text-gray-700">○</span>
              <span>Phase 3: alerts, trends, API access, team RBAC</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
