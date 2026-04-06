import { AdRepository } from "@/server/repositories/ad.repository";
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

  const [result, stats] = await Promise.all([
    AdRepository.list({
      search,
      isActive,
      hasLandingUrl: hasLanding,
      linkedStore,
      staleInactive: staleInactive || undefined,
      duplicateCanonicalOnly: duplicateCanonicalOnly || undefined,
      confidenceMin,
      confidenceMax,
      firstSeenAfter,
      firstSeenBefore,
      page,
      pageSize: 25,
    }),
    AdRepository.getStats(),
  ]);

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
    </>
  );

  type AdRow = (typeof result.data)[number];

  return (
    <div>
      <PageHeader
        title={`Ads (${stats.total.toLocaleString()} total)`}
        description={`${result.total.toLocaleString()} match filters · Meta Ad Library normalized entities`}
      />

      <div className="flex flex-wrap items-end gap-3 mb-3 sticky top-0 z-10 py-2 -mt-2 bg-[#0c0d10]/95 backdrop-blur-sm border-b border-gray-800/80">
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
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 items-center">
          <span>
            <span className="text-emerald-400/90">{stats.active}</span> active
          </span>
          <span className="text-gray-700">|</span>
          <span>{stats.withCanonical} w/ canonical</span>
          <span className="text-gray-700">|</span>
          <span className="text-amber-400/80">{stats.lowConfidence}</span> low conf.
        </div>
        <Link href="/ads" className="text-xs text-gray-500 hover:text-gray-400 ml-auto">
          Reset
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-500">
        <label className="flex items-center gap-2">
          <span>First seen from</span>
          <form action="/ads" method="get" className="inline">
            {hiddenDate}
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? ""}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
            <button type="submit" className="ml-1 text-indigo-400">
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
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-200"
            />
            <button type="submit" className="ml-1 text-indigo-400">
              Apply
            </button>
          </form>
        </label>
      </div>

      <div className="rounded-lg border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[1180px]">
          <thead>
            <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Ad id
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Advertiser / page
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Platform
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Activity
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Landing domain
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Store
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Confidence
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                First / last
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Flags
              </th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-gray-600">
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
                return (
                  <tr key={ad.id} className={`hover:bg-gray-900/40 ${rowAccent(ad)}`}>
                    <td className="px-3 py-2.5 font-mono text-[10px] text-gray-500 max-w-[100px] truncate">
                      <Link href={`/ads/${ad.id}`} className="hover:text-indigo-400">
                        {ad.id.slice(0, 10)}…
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-gray-100 font-medium truncate max-w-[180px]">
                        {ad.pageName ?? "—"}
                      </div>
                      <div className="text-[11px] text-gray-600 font-mono truncate max-w-[180px]">
                        {ad.pageId ?? ad.externalId}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-500 max-w-[100px]">
                      {platformsLabel(ad.platforms as Platform[])}
                    </td>
                    <td className="px-3 py-2.5">
                      {ad.isActive !== null && ad.isActive !== undefined ? (
                        statusBadge(ad.isActive ? "ACTIVE" : "PAUSED")
                      ) : (
                        <span className="text-gray-600 text-xs">Unknown</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 font-mono truncate max-w-[140px]">
                      {landingDomain(ad)}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {storeLink ? (
                        <Link
                          href={`/stores/${storeLink.id}`}
                          className="text-indigo-400 hover:text-indigo-300 truncate block max-w-[120px]"
                        >
                          {storeLink.domain}
                        </Link>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <ConfidenceInline score={ad.confidenceScores[0] ?? null} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-gray-500 leading-snug">
                      <div>{timeAgo(ad.firstSeenAt)}</div>
                      <div className="text-gray-600">{timeAgo(ad.lastSeenAt)}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <EntityWarningChips items={warnings} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/ads/${ad.id}`} className="text-xs text-indigo-400">
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
