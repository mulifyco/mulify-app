import Link from "next/link";
import { LandingPageRepository } from "@/server/repositories/landing-page.repository";
import PageHeader from "@/components/ui/PageHeader";
import { timeAgo } from "@/lib/date";
import Pagination from "@/components/ui/Pagination";
import SearchBar from "@/components/ui/SearchBar";
import ConfidenceInline from "@/components/internal/ConfidenceInline";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ page?: string; search?: string; domain?: string }>;
}

export default async function LandingPagesPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const search = params.search;
  const domain = params.domain;

  const result = await LandingPageRepository.list({
    search,
    domain,
    page,
    pageSize: 25,
  });

  type LandingPageRow = (typeof result.data)[number];

  return (
    <div>
      <PageHeader
        title={`Landing pages (${result.total.toLocaleString()})`}
        description="Discovered destination URLs — linkage to ads and entity graph"
      />

      <div className="flex flex-wrap items-center gap-4 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-[#0c0d10]/95 backdrop-blur-sm border-b border-gray-800/80">
        <Suspense fallback={null}>
          <SearchBar placeholder="URL or title…" />
        </Suspense>
        <form action="/landing-pages" method="get" className="flex items-center gap-2 text-xs">
          <input type="hidden" name="search" value={params.search ?? ""} />
          <label className="text-gray-500">Domain contains</label>
          <input
            name="domain"
            defaultValue={domain ?? ""}
            placeholder="example.com"
            className="bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200 w-40"
          />
          <button type="submit" className="text-indigo-400">
            Filter
          </button>
        </form>
        <Link href="/landing-pages" className="text-xs text-gray-500 ml-auto">
          Reset
        </Link>
      </div>

      <div className="rounded-lg border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="bg-gray-900/80 border-b border-gray-800 text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                URL
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Domain
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-right">
                Ads
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-right">
                Links
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-right">
                Products
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-right">
                Stores
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Confidence
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">
                Last seen
              </th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-gray-600">
                  No landing pages indexed yet.
                </td>
              </tr>
            ) : (
              result.data.map((lp: LandingPageRow) => (
                <tr key={lp.id} className="hover:bg-gray-900/40">
                  <td className="px-3 py-2.5 max-w-[280px]">
                    <div className="text-xs text-gray-300 truncate font-mono">{lp.url}</div>
                    {lp.title && (
                      <div className="text-[11px] text-gray-600 truncate mt-0.5">{lp.title}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{lp.domain}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">
                    {lp._count.ads}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-500">
                    {lp._count.entityLinks}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                    {lp.linkedProductCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                    {lp.linkedStoreCount}
                  </td>
                  <td className="px-3 py-2.5">
                    <ConfidenceInline score={lp.confidenceScores[0] ?? null} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{timeAgo(lp.lastSeenAt)}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/landing-pages/${lp.id}`} className="text-xs text-indigo-400">
                      Open
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination {...result} />
    </div>
  );
}
