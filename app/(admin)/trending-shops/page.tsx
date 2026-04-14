import PageHeader from "@/components/ui/PageHeader";
import SearchBar from "@/components/ui/SearchBar";
import Pagination from "@/components/ui/Pagination";
import { Suspense } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { compactNumber, formatMoney, formatPct, trendBadgeVariant } from "@/lib/admin/formatters";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    search?: string;
    sort?: string;
    order?: string;
  }>;
}

type TrendingShopRow = {
  id: string;
  domain: string;
  name: string;
  trendScore: number;
  monthlyVisits: number;
  estimatedDailyRevenue: number;
  activeMetaAds: number;
  latestGrowth1m?: number | null;
  activeAdsDelta?: number | null;
  currency?: string | null;
  createdAt: string;
};

async function fetchTrendingShops(params: {
  search?: string;
  page: number;
  pageSize: number;
  sort?: string;
  order?: string;
}): Promise<{
  items: TrendingShopRow[];
  total: number;
  page: number;
  pageSize: number;
  creditsLeft?: number;
}> {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = new URL("/api/trending-shops", base);
  if (params.search) url.searchParams.set("q", params.search);
  url.searchParams.set("page", String(params.page));
  url.searchParams.set("pageSize", String(params.pageSize));
  if (params.sort) url.searchParams.set("sort", params.sort);
  if (params.order) url.searchParams.set("order", params.order);

  const res = await fetch(url.toString(), { cache: "no-store" });
  const ct = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  let json: any = null;
  if (ct.includes("application/json") && raw) {
    try {
      json = JSON.parse(raw) as any;
    } catch {
      json = null;
    }
  }

  // If we got HTML (or otherwise non-JSON), treat as an error (often login/redirect/500 page).
  if (!ct.includes("application/json")) {
    const err = new Error("Veri alınamadı");
    (err as any).status = res.status;
    throw err;
  }

  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : "Veri alınamadı";
    const err = new Error(msg);
    (err as any).status = res.status;
    throw err;
  }

  return {
    items: Array.isArray(json?.items) ? (json.items as TrendingShopRow[]) : [],
    total: typeof json?.total === "number" ? json.total : 0,
    page: typeof json?.page === "number" ? json.page : params.page,
    pageSize: typeof json?.pageSize === "number" ? json.pageSize : params.pageSize,
    creditsLeft: typeof json?.creditsLeft === "number" ? json.creditsLeft : undefined,
  };
}

export default async function TrendingShopsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const search = sp.search?.trim() || undefined;

  let data:
    | Awaited<ReturnType<typeof fetchTrendingShops>>
    | { items: TrendingShopRow[]; total: number; page: number; pageSize: number; creditsLeft?: number }
    | null = null;
  let error: string | null = null;
  let status: number | null = null;

  try {
    data = await fetchTrendingShops({
      search,
      page,
      pageSize: 20,
      sort: sp.sort,
      order: sp.order,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Veri alınamadı";
    status = (e as any)?.status ?? null;
    data = { items: [], total: 0, page, pageSize: 20 };
  }

  const totalPages = Math.ceil((data.total || 0) / data.pageSize) || 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Trending Shops"
        description={
          data.creditsLeft != null
            ? `Kalan kredi: ${data.creditsLeft}`
            : "Local Shop table (demo) — trend scoreboard"
        }
        action={
          <Link href="/trending-shops" className="text-sm text-muted hover:opacity-80">
            Reset
          </Link>
        }
      />

      <div className="flex flex-wrap items-end gap-3 mb-2 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="Shop name / domain…" />
        </Suspense>
      </div>

      {error && (
        <div className="rounded border border-border bg-card px-3 py-2 text-sm text-muted shadow-sm">
          {status === 402 ? "Yetersiz kredi" : "Veri alınamadı"}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Shop</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Trend</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Monthly visits</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Growth</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">
                Est. daily revenue
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Active ads</th>
              <th className="px-3 py-2.5 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-2">
                  No shops found.
                </td>
              </tr>
            ) : (
              data.items.map((s) => (
                <tr key={s.id} className="hover:bg-surface-2/70">
                  <td className="px-3 py-2.5">
                    <div className="text-foreground font-medium">{s.name}</div>
                    <div className="text-[11px] text-muted-2 font-mono">{s.domain}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Badge label={s.trendScore.toFixed(1)} variant={trendBadgeVariant(s.trendScore)} />
                      <span className="text-[11px] text-muted-2">/100</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted tabular-nums">{compactNumber(s.monthlyVisits)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums">
                    {typeof s.latestGrowth1m === "number" ? (
                      <span className={s.latestGrowth1m >= 0 ? "text-emerald-600" : "text-red-600"}>
                        {formatPct(s.latestGrowth1m)}
                      </span>
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-foreground tabular-nums">
                    {formatMoney(s.estimatedDailyRevenue, s.currency ?? "USD")}
                  </td>
                  <td className="px-3 py-2.5 text-muted tabular-nums">
                    <div className="flex items-center gap-2">
                      <span>{compactNumber(s.activeMetaAds)}</span>
                      {typeof s.activeAdsDelta === "number" && s.activeAdsDelta !== 0 && (
                        <span
                          className={`text-[11px] ${
                            s.activeAdsDelta > 0 ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {s.activeAdsDelta > 0 ? `+${s.activeAdsDelta}` : String(s.activeAdsDelta)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <a
                      href={`https://${s.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:opacity-80"
                    >
                      Visit
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination total={data.total} page={data.page} pageSize={data.pageSize} totalPages={totalPages} />
    </div>
  );
}

