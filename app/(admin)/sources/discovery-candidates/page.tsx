import Link from "next/link";
import { Suspense } from "react";
import PageHeader from "@/components/ui/PageHeader";
import prisma from "@/lib/prisma";
import SearchBar from "@/components/ui/SearchBar";
import FilterSelect from "@/components/internal/FilterSelect";
import Pagination from "@/components/ui/Pagination";
import Badge from "@/components/ui/Badge";
import { formatDate, timeAgo } from "@/lib/date";
import PromoteCandidateButton from "./PromoteCandidateButton";
import EmptyState from "@/components/internal/EmptyState";
import QueryErrorState from "@/components/internal/QueryErrorState";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import ActionMenu from "@/components/internal/ActionMenu";

export const dynamic = "force-dynamic";

const PROMOTED_OPTIONS = [
  { value: "false", label: "Not promoted" },
  { value: "true", label: "Promoted" },
];

const SCORE_OPTIONS = [
  { value: "0", label: "All scores" },
  { value: "50", label: "≥ 50" },
  { value: "70", label: "≥ 70" },
  { value: "85", label: "≥ 85" },
];

function scoreBadge(score: number): { variant: "green" | "yellow" | "red" | "default"; label: string } {
  if (score >= 85) return { variant: "green", label: String(score) };
  if (score >= 70) return { variant: "green", label: String(score) };
  if (score >= 55) return { variant: "yellow", label: String(score) };
  return { variant: "default", label: String(score) };
}

export default async function DiscoveryCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; promoted?: string; minScore?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 30;
  const search = params.search?.trim() || undefined;
  const promoted = params.promoted === "true" ? true : params.promoted === "false" ? false : undefined;
  const minScore = params.minScore ? Math.max(0, Math.min(100, parseInt(params.minScore, 10) || 0)) : undefined;

  let items: Awaited<ReturnType<typeof prisma.discoveryCandidate.findMany>> = [];
  let total = 0;
  let error: string | null = null;

  try {
    const where = {
      ...(search ? { domain: { contains: search, mode: "insensitive" as const } } : {}),
      ...(promoted != null ? { isPromoted: promoted } : {}),
      ...(minScore != null && minScore > 0 ? { discoveryScore: { gte: minScore } } : {}),
    };

    const skip = (page - 1) * pageSize;
    [items, total] = await Promise.all([
      prisma.discoveryCandidate.findMany({
        where: where as never,
        orderBy: [{ discoveryScore: "desc" }, { updatedAt: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.discoveryCandidate.count({ where: where as never }),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load discovery candidates.";
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <PageHeader
        title="Discovery candidates"
        description="High-probability commerce domains discovered from raw evidence. Promote to create SHOPIFY_DOMAIN sources."
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/sources" className="text-sm text-muted hover:opacity-80">
              ← Sources
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="Search domain…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="promoted"
            label="Promoted"
            currentValue={params.promoted ?? ""}
            options={PROMOTED_OPTIONS}
          />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect
            param="minScore"
            label="Score"
            currentValue={params.minScore ?? ""}
            options={SCORE_OPTIONS}
          />
        </Suspense>
        <Link href="/sources/discovery-candidates" className="text-xs text-muted ml-auto hover:opacity-80">
          Reset filters
        </Link>
      </div>

      {error ? (
        <QueryErrorState message={error} />
      ) : items.length === 0 ? (
        <EmptyState
          title="No discovery candidates yet"
          description="When the engine finds high-probability storefronts, they’ll appear here. Start by running Sources → sync, then discovery will backfill candidates."
          action={
            <Link
              href="/sources"
              className="px-3 py-1.5 text-xs rounded bg-foreground text-background hover:opacity-90"
            >
              Go to Sources →
            </Link>
          }
        />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[1080px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Domain</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Score</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Evidence</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Reason</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Source</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Promoted</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">Created</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((c) => {
                  const sb = scoreBadge(c.discoveryScore);
                  return (
                    <tr key={c.id} className="hover:bg-surface-2/70">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">{c.domain}</div>
                        <div className="text-[11px] text-muted-2 mt-0.5">{c.sourceTypeHint}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge label={sb.label} variant={sb.variant} />
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-xs text-muted">
                        {c.rawEvidenceCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted max-w-[520px] truncate" title={c.discoveryReason}>
                        {c.discoveryReason}
                        <div className="mt-1">
                          <div className="flex items-center gap-3">
                            <ExplainDrawer
                              entityType="DISCOVERY_CANDIDATE"
                              entityId={c.id}
                              triggerLabel="Why?"
                              title={`Discovery candidate · ${c.domain}`}
                            />
                            <ActionMenu
                              ctx={{
                                entityType: "DISCOVERY_CANDIDATE",
                                entityId: c.id,
                                candidateId: c.id,
                                domain: c.domain,
                                sourceId: c.discoveredFromSourceId,
                                label: c.domain,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        <Link href={`/sources/${c.discoveredFromSourceId}`} className="hover:opacity-80">
                          {c.discoveredFromSourceId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {c.isPromoted ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge label="Promoted" variant="green" />
                            <span className="text-[11px] text-muted-2">{timeAgo(c.promotedAt)}</span>
                          </div>
                        ) : (
                          <Badge label="No" variant="default" />
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">{formatDate(c.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {c.isPromoted ? (
                          <span className="text-xs text-muted-2">—</span>
                        ) : (
                          <PromoteCandidateButton candidateId={c.id} domain={c.domain} disabled={c.discoveryScore < 50} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination total={total} page={page} pageSize={pageSize} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}

