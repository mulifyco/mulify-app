import { Suspense } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { reviewQueueItemDb } from "@/lib/prisma-review-queue-item-delegate";
import SearchBar from "@/components/ui/SearchBar";
import FilterSelect from "@/components/internal/FilterSelect";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/internal/EmptyState";
import QueryErrorState from "@/components/internal/QueryErrorState";
import ReviewQueueClient, { type ReviewQueueRow } from "./ReviewQueueClient";
import PaywallPanel from "@/components/internal/PaywallPanel";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "LOW_CONFIDENCE_PRODUCT_CLUSTER", label: "Low confidence product cluster" },
  { value: "LOW_CONFIDENCE_CREATIVE_CLUSTER", label: "Low confidence creative cluster" },
  { value: "HIGH_SCORE_UNVERIFIED_ITEM", label: "High score unverified" },
  { value: "DISCOVERY_CANDIDATE_REVIEW", label: "Discovery candidate" },
  { value: "ENTITY_LINK_REVIEW", label: "Entity link review" },
  { value: "SOURCE_RELIABILITY_ALERT", label: "Source reliability" },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "Any" },
  { value: "60", label: "≥ 60" },
  { value: "75", label: "≥ 75" },
  { value: "85", label: "≥ 85" },
];

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; type?: string; priority?: string; search?: string }>;
}) {
  const session = await auth();
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "REVIEW_QUEUE")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Review queue" description="Analyst workflow for manual triage." />
        <PaywallPanel
          feature="REVIEW_QUEUE"
          currentPlan={plan}
          title="Review Queue is a Pro feature"
          description="Upgrade to unlock analyst triage workflows, review actions, and explainability-assisted decisions."
        />
      </div>
    );
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = 30;
  const skip = (page - 1) * pageSize;

  const status = params.status?.trim() || undefined;
  const type = params.type?.trim() || undefined;
  const priority = params.priority?.trim() || undefined;
  const search = params.search?.trim() || undefined;

  let rows: ReviewQueueRow[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    const where: Record<string, unknown> = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(priority ? { priority: { gte: Number.parseInt(priority, 10) || 0 } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { reason: { contains: search, mode: "insensitive" } },
              { entityId: { contains: search, mode: "insensitive" } },
              { sourceId: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, cnt] = await Promise.all([
      reviewQueueItemDb().findMany({
        where,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      reviewQueueItemDb().count({ where }),
    ]);

    type RqDbRow = {
      id: string;
      type: string;
      status: string;
      priority: number;
      title: string;
      reason: string;
      entityType: string | null;
      entityId: string | null;
      sourceId: string | null;
      metadata: unknown;
      createdAt: Date;
    };
    rows = (items as RqDbRow[]).map((r) => ({
      id: r.id,
      type: String(r.type),
      status: String(r.status) as ReviewQueueRow["status"],
      priority: r.priority,
      title: r.title,
      reason: r.reason,
      entityType: r.entityType ?? null,
      entityId: r.entityId ?? null,
      sourceId: r.sourceId ?? null,
      metadata: r.metadata as ReviewQueueRow["metadata"],
      createdAt: r.createdAt.toISOString(),
    }));
    total = cnt;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load review queue.";
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <PageHeader
        title="Review queue"
        description="Manual analyst workflow for borderline signals: low confidence clusters, high-score unverified items, and discovery candidates."
      />

      <div className="flex flex-wrap items-center gap-3 mb-4 sticky top-0 z-10 py-2 -mt-2 bg-background/95 backdrop-blur-sm border-b border-border">
        <Suspense fallback={null}>
          <SearchBar placeholder="Search title / reason / id…" />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect param="status" label="Status" currentValue={params.status ?? ""} options={STATUS_OPTIONS} />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect param="type" label="Type" currentValue={params.type ?? ""} options={TYPE_OPTIONS} />
        </Suspense>
        <Suspense fallback={null}>
          <FilterSelect param="priority" label="Priority" currentValue={params.priority ?? ""} options={PRIORITY_OPTIONS} />
        </Suspense>
      </div>

      {error ? (
        <QueryErrorState message={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No review items right now"
          description="This queue fills automatically when the engine detects borderline or high-potential signals that need human validation."
          action={
            <a
              href="/dashboard"
              className="px-3 py-1.5 text-xs rounded bg-foreground text-background hover:opacity-90"
            >
              Back to dashboard →
            </a>
          }
        />
      ) : (
        <>
          <ReviewQueueClient initial={rows} />
          <Pagination total={total} page={page} pageSize={pageSize} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}

