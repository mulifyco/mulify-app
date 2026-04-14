import PageHeader from "@/components/ui/PageHeader";
import { statusBadge } from "@/components/ui/Badge";
import { timeAgo } from "@/lib/date";
import Link from "next/link";
import Pagination from "@/components/ui/Pagination";
import { Suspense } from "react";
import SearchBar from "@/components/ui/SearchBar";
import FilterSelect from "@/components/internal/FilterSelect";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import EntityWarningChips from "@/components/internal/EntityWarningChips";
import {
  parseBoolParam,
  parseConfidence,
  parseDateParam,
} from "@/lib/admin/search-params";
import { adRowWarnings, platformsLabel } from "@/lib/admin/entity-warnings";
import type { Platform } from "@/types";
import { AdRepository } from "@/server/repositories/ad.repository";
import Badge from "@/components/ui/Badge";
import { compactNumber } from "@/lib/admin/formatters";

export const dynamic = "force-dynamic";

function landingDomain(ad: {
  landingPages: { domain: string }[];
  canonicalUrl: string | null;
  destinationUrl: string | null;
}): string {
  if (ad.landingPages[0]?.domain) return ad.landingPages[0].domain;
  for (const u of [ad.destinationUrl, ad.canonicalUrl]) {
    if (!u) continue;
    try {
      return new URL(u).hostname;
    } catch {
      /* ignore */
    }
  }
  return "—";
}

function rowAccent(ad: {
  confidenceScores: { level: string; overallScore: number }[];
  destinationUrl: string | null;
  canonicalUrl: string | null;
}): string {
  const s = ad.confidenceScores[0];
  const low = s && (s.level === "LOW" || s.overallScore < 0.45);
  const noUrl = !ad.destinationUrl && !ad.canonicalUrl;
  if (low && noUrl) return "border-l-2 border-l-red-600/80";
  if (low) return "border-l-2 border-l-amber-600/70";
  if (noUrl) return "border-l-2 border-l-amber-800/60";
  return "";
}

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    isActive?: string;
    hasLanding?: string;
    linkedStore?: string;
    staleInactive?: string;
    dupCanon?: string;
    cmin?: string;
    cmax?: string;
    confidenceMax?: string;
    from?: string;
    to?: string;
    creativeClusterId?: string;
  }>;
}

export default async function AdsPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const search = params.search;
  const isActive = parseBoolParam(params.isActive);
  const hasLanding = parseBoolParam(params.hasLanding);
  const linkedStore = parseBoolParam(params.linkedStore);
  const staleInactive = params.staleInactive === "1";
  const duplicateCanonicalOnly = params.dupCanon === "1";
  const confidenceMin = parseConfidence(params.cmin);
  const confidenceMax =
    parseConfidence(params.cmax) ?? parseConfidence(params.confidenceMax);
  const firstSeenAfter = parseDateParam(params.from);
  const firstSeenBefore = parseDateParam(params.to);
  const creativeClusterId = params.creativeClusterId?.trim() || undefined;

  const stats = await AdRepository.getStats();

  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = new URL("/api/ads", base);
  if (search) url.searchParams.set("search", search);
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", "25");

  // Keep existing filter params so UI/routing stays stable (backend may ignore extras for now).
  if (params.isActive != null) url.searchParams.set("isActive", params.isActive);
  if (params.hasLanding != null) url.searchParams.set("hasLanding", params.hasLanding);
  if (params.linkedStore != null) url.searchParams.set("linkedStore", params.linkedStore);
  if (params.staleInactive != null) url.searchParams.set("staleInactive", params.staleInactive);
  if (params.dupCanon != null) url.searchParams.set("dupCanon", params.dupCanon);
  if (confidenceMin != null) url.searchParams.set("cmin", String(confidenceMin));
  if (confidenceMax != null) url.searchParams.set("cmax", String(confidenceMax));
  if (firstSeenAfter) url.searchParams.set("from", firstSeenAfter.toISOString().slice(0, 10));
  if (firstSeenBefore) url.searchParams.set("to", firstSeenBefore.toISOString().slice(0, 10));
  if (creativeClusterId) url.searchParams.set("creativeClusterId", creativeClusterId);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const ct = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  const json =
    ct.includes("application/json") && raw
      ? (JSON.parse(raw) as any)
      : ({ error: res.ok ? undefined : "Veri alınamadı", _raw: raw.slice(0, 400) } as any);

  const creditsLeft: number | undefined = typeof json?.creditsLeft === "number" ? json.creditsLeft : undefined;
  const errorMsg: string | null = !res.ok ? (typeof json?.error === "string" ? json.error : "Veri alınamadı") : null;
  const items = (json?.items ?? []) as unknown[];
  const total = typeof json?.total === "number" ? json.total : 0;
  const pageSize = typeof json?.pageSize === "number" ? json.pageSize : 25;
  const totalPages = Math.ceil(total / pageSize) || 0;

  const result = {
    data: items as any[],
    total,
    page,
    pageSize,
    totalPages,
  };

  const cmaxVal = String(confidenceMax ?? params.confidenceMax ?? params.cmax ?? "");
  const cminVal = String(confidenceMin ?? params.cmin ?? "");

  const hiddenDate = (
    <>
      <input type="hidden" name="search" value={params.search ?? ""} />
      <input type="hidden" name="isActive" value={params.isActive ?? ""} />
      <input type="hidden" name="hasLanding" value={params.hasLanding ?? ""} />
      <input type="hidden" name="linkedStore" value={params.linkedStore ?? ""} />
      <input type="hidden" name="staleInactive" value={params.staleInactive ?? ""} />
      <input type="hidden" name="dupCanon" value={params.dupCanon ?? ""} />
      <input type="hidden" name="cmin" value={cminVal} />
      <input type="hidden" name="cmax" value={cmaxVal} />
      <input type="hidden" name="creativeClusterId" value={params.creativeClusterId ?? ""} />
    </>
  );

  type AdRow = (typeof result.data)[number];

  return (
    <div>
      <PageHeader
        title={`Ads (${stats.total.toLocaleString()} total)`}
        description={
          errorMsg
            ? `${errorMsg === "Yetersiz kredi" ? "Yetersiz kredi" : "Veri alınamadı"}`
            : `${result.total.toLocaleString()} match filters · Meta Ad Library normalized entities${
                creditsLeft != null ? ` · Kalan kredi: ${creditsLeft}` : ""
              }`
        }
      />

      {creativeClusterId && (
        <div className="mb-4 rounded-lg border border-indigo-500/25 bg-surface-2/50 px-3 py-2 text-sm text-muted flex flex-wrap items-center justify-between gap-2">
          <span>
            Showing ads for creative cluster{" "}
            <span className="font-mono text-xs text-foreground">{creativeClusterId}</span>
          </span>
          <Link href="/ads" className="text-xs text-indigo-600 dark:text-indigo-400 hover:opacity-80 shrink-0">
            Clear cluster filter
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 mb-3 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="Ad id, page, text, external id…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="isActive"
            label="Activity"
            currentValue={
              params.isActive === "true" ? "true" : params.isActive === "false" ? "false" : ""
            }
            options={[
              { value: "true", label: "Active" },
              { value: "false", label: "Inactive" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="hasLanding"
            label="Landing URL"
            currentValue={
              params.hasLanding === "true"
                ? "true"
                : params.hasLanding === "false"
                  ? "false"
                  : ""
            }
            options={[
              { value: "true", label: "Has URL" },
              { value: "false", label: "Missing URL" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="linkedStore"
            label="Store link"
            currentValue={
              params.linkedStore === "true"
                ? "true"
                : params.linkedStore === "false"
                  ? "false"
                  : ""
            }
            options={[
              { value: "true", label: "Linked store" },
              { value: "false", label: "No store link" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="staleInactive"
            label="Stale inactive"
            currentValue={params.staleInactive ?? ""}
            options={[{ value: "1", label: "Inactive 60d+" }]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="dupCanon"
            label="Duplicates"
            currentValue={params.dupCanon ?? ""}
            options={[{ value: "1", label: "Dup canonical URL" }]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="cmin"
            label="Min score"
            currentValue={cminVal}
            options={[
              { value: "0.3", label: "≥ 0.30" },
              { value: "0.45", label: "≥ 0.45" },
              { value: "0.6", label: "≥ 0.60" },
            ]}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="cmax"
            label="Max score"
            currentValue={cmaxVal}
            options={[
              { value: "0.35", label: "≤ 0.35" },
              { value: "0.45", label: "≤ 0.45" },
              { value: "0.55", label: "≤ 0.55" },
              { value: "0.7", label: "≤ 0.70" },
            ]}
          />
        </Suspense>
        <div className="flex flex-wrap gap-3 text-xs text-muted items-center">
          <span>
            <span className="text-emerald-600">{stats.active}</span> active
          </span>
          <span className="text-muted-2">|</span>
          <span>{stats.withCanonical} w/ canonical</span>
          <span className="text-muted-2">|</span>
          <span className="text-amber-600">{stats.lowConfidence}</span> low conf.
        </div>
        <Link href="/ads" className="text-xs text-muted hover:opacity-80 ml-auto">
          Reset
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 mb-4 text-xs text-muted">
        <label className="flex items-center gap-2">
          <span>First seen from</span>
          <form action="/ads" method="get" className="inline">
            {hiddenDate}
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? ""}
              className="bg-surface border border-border rounded px-2 py-1 text-foreground"
            />
            <button type="submit" className="ml-1 text-indigo-600 hover:opacity-80">
              Apply
            </button>
          </form>
        </label>
        <label className="flex items-center gap-2">
          <span>First seen to</span>
          <form action="/ads" method="get" className="inline">
            {hiddenDate}
            <input type="hidden" name="from" value={params.from ?? ""} />
            <input
              type="date"
              name="to"
              defaultValue={params.to ?? ""}
              className="bg-surface border border-border rounded px-2 py-1 text-foreground"
            />
            <button type="submit" className="ml-1 text-indigo-600 hover:opacity-80">
              Apply
            </button>
          </form>
        </label>
      </div>

      {errorMsg && (
        <div className="rounded border border-border bg-card px-3 py-2 text-sm text-muted mb-4 shadow-sm">
          {res.status === 402 ? "Yetersiz kredi" : "Veri alınamadı"}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[1180px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Ad id
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Advertiser / page
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Creative
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Creative cluster
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Platform
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Activity
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Landing domain
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Store
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Confidence
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                First / last
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Impr.
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Flags
              </th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-10 text-center text-muted-2">
                  No ads match filters.
                </td>
              </tr>
            ) : (
              result.data.map((ad: AdRow) => {
                const warnings = adRowWarnings({
                  ...ad,
                  landingPages: ad.landingPages,
                });
                const storeLink = ad.entityLinks[0]?.store;
                const creativeCluster = (ad as unknown as { creativeClusterMember?: { cluster?: { fingerprint: string; creativeCount: number; storeCount: number; productClusterCount: number; saturationScore: number; scaleScore: number; confidence: number } } })
                  .creativeClusterMember?.cluster;
                const thumb =
                  (ad as unknown as { thumbnailUrl?: string | null; adImageUrl?: string | null }).thumbnailUrl ??
                  ad.adImageUrl ??
                  null;
                const creativeType = (ad as unknown as { creativeType?: string | null }).creativeType ?? null;
                const impressionsEstimate = (ad as unknown as { impressionsEstimate?: number | null }).impressionsEstimate ?? null;
                return (
                  <tr key={ad.id} className={`hover:bg-surface-2/70 ${rowAccent(ad)}`}>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-muted max-w-[100px] truncate">
                      <Link href={`/ads/${ad.id}`} className="text-muted hover:text-indigo-600">
                        {ad.id.slice(0, 10)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-foreground font-medium truncate max-w-[180px]">
                        {ad.pageName ?? "—"}
                      </div>
                      <div className="text-[11px] text-muted-2 font-mono truncate max-w-[180px]">
                        {ad.pageId ?? ad.externalId}
                      </div>
                      {ad.shop?.domain && (
                        <div className="text-[11px] text-muted-2 mt-1 font-mono truncate max-w-[180px]">
                          {ad.shop.domain}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded bg-surface-2 border border-border overflow-hidden shrink-0">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[color:var(--surface-2)] to-[color:var(--surface)]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          {creativeType ? (
                            <Badge label={creativeType} variant="purple" />
                          ) : (
                            <span className="text-xs text-muted-2">—</span>
                          )}
                          <div className="text-[11px] text-muted-2 mt-1 truncate max-w-[220px]">
                            {(ad.adText ?? ad.adTitle ?? ad.adBody ?? "").toString().slice(0, 80) || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted">
                      {creativeCluster ? (
                        <div className="space-y-0.5">
                          <div className="text-foreground tabular-nums">
                            scale {creativeCluster.scaleScore} · stores {creativeCluster.storeCount} · ads{" "}
                            {creativeCluster.creativeCount}
                          </div>
                          <div className="text-muted-2 font-mono truncate max-w-[220px]">
                            {creativeCluster.fingerprint}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted max-w-[100px]">
                      {platformsLabel(ad.platforms as Platform[])}
                    </td>
                    <td className="px-3 py-2.5">
                      {ad.isActive !== null && ad.isActive !== undefined ? (
                        statusBadge(ad.isActive ? "ACTIVE" : "PAUSED")
                      ) : (
                        <span className="text-muted-2 text-xs">Unknown</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted font-mono truncate max-w-[140px]">
                      {landingDomain(ad)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {storeLink ? (
                        <Link
                          href={`/stores/${storeLink.id}`}
                          className="text-indigo-600 hover:opacity-80 truncate block max-w-[120px]"
                        >
                          {storeLink.domain}
                        </Link>
                      ) : (
                        <span className="text-muted-2">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ConfidenceInline score={ad.confidenceScores[0] ?? null} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-muted leading-snug">
                      <div>{timeAgo(ad.firstSeenAt)}</div>
                      <div className="text-muted-2">{timeAgo(ad.lastSeenAt)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {typeof impressionsEstimate === "number" ? compactNumber(impressionsEstimate) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <EntityWarningChips items={warnings} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/ads/${ad.id}`} className="text-xs text-indigo-600 hover:opacity-80">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination {...result} />
    </div>
  );
}
