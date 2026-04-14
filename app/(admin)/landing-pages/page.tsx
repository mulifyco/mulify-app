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

      <div className="flex flex-wrap items-center gap-4 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="URL or title…" />
        </Suspense>
        <form action="/landing-pages" method="get" className="flex items-center gap-2 text-xs">
          <input type="hidden" name="search" value={params.search ?? ""} />
          <label className="text-muted">Domain contains</label>
          <input
            name="domain"
            defaultValue={domain ?? ""}
            placeholder="example.com"
            className="bg-surface border border-border rounded px-2 py-1.5 text-foreground w-40 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
          />
          <button type="submit" className="text-indigo-600 hover:opacity-80">
            Filter
          </button>
        </form>
        <Link href="/landing-pages" className="text-xs text-muted ml-auto hover:opacity-80">
          Reset
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                URL
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Domain
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Ads
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Links
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Products
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">
                Stores
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Confidence
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Last seen
              </th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.data.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-2">
                  No landing pages indexed yet.
                </td>
              </tr>
            ) : (
              result.data.map((lp: LandingPageRow) => (
                <tr key={lp.id} className="hover:bg-surface-2/70">
                  <td className="px-3 py-2.5 max-w-[280px]">
                    <div className="text-xs text-foreground truncate font-mono">{lp.url}</div>
                    {lp.title && (
                      <div className="text-[11px] text-muted-2 truncate mt-0.5">{lp.title}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{lp.domain}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    {lp._count.ads}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                    {lp._count.entityLinks}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                    {lp.linkedProductCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                    {lp.linkedStoreCount}
                  </td>
                  <td className="px-3 py-2.5">
                    <ConfidenceInline score={lp.confidenceScores[0] ?? null} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{timeAgo(lp.lastSeenAt)}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/landing-pages/${lp.id}`} className="text-xs text-indigo-600 hover:opacity-80">
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
