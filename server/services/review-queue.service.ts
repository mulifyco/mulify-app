import prisma from "@/lib/prisma";
import { reviewQueueItemDb } from "@/lib/prisma-review-queue-item-delegate";

/** Minimal shape returned from review queue delegate (typed for callers). */
export type ReviewQueueItemRow = {
  id: string;
  priority: number;
  title: string;
  reason: string;
  metadata?: unknown;
};

export type ReviewQueueKey = {
  type: string;
  workspaceId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  sourceId?: string | null;
  /** When set, dedupes open items with metadata.dedupeKey === this value. */
  dedupeKey?: string | null;
};

async function resolveFallbackWorkspaceId(): Promise<string | null> {
  const ws = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }).catch(() => null);
  return ws?.id ?? null;
}

export async function findOpenReviewQueueItem(key: ReviewQueueKey): Promise<ReviewQueueItemRow | null> {
  if (key.dedupeKey) {
    return (await reviewQueueItemDb().findFirst({
      where: {
        type: key.type as never,
        status: { in: ["OPEN", "IN_REVIEW"] as never },
        ...(key.workspaceId ? { workspaceId: key.workspaceId } : {}),
        metadata: { path: ["dedupeKey"], equals: key.dedupeKey },
      } as never,
      orderBy: { createdAt: "desc" },
    })) as ReviewQueueItemRow | null;
  }

  return (await reviewQueueItemDb().findFirst({
    where: {
      type: key.type as never,
      status: { in: ["OPEN", "IN_REVIEW"] as never },
      ...(key.workspaceId ? { workspaceId: key.workspaceId } : {}),
      entityType: key.entityType ?? null,
      entityId: key.entityId ?? null,
      sourceId: key.sourceId ?? null,
    } as never,
    orderBy: { createdAt: "desc" },
  })) as ReviewQueueItemRow | null;
}

export async function openReviewQueueItem(input: {
  workspaceId?: string | null;
  type: string;
  title: string;
  reason: string;
  priority?: number;
  entityType?: string | null;
  entityId?: string | null;
  sourceId?: string | null;
  metadata?: any;
  /** Stable key for dedupe (stored into metadata.dedupeKey). */
  dedupeKey?: string;
}): Promise<ReviewQueueItemRow> {
  const baseMeta =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? { ...(input.metadata as Record<string, unknown>) }
      : {};
  const meta =
    input.dedupeKey != null && input.dedupeKey !== ""
      ? { ...baseMeta, dedupeKey: input.dedupeKey }
      : input.metadata;

  const workspaceId = input.workspaceId ?? (await resolveFallbackWorkspaceId());
  if (!workspaceId) throw new Error("No workspace available for review queue item.");

  const existing = await findOpenReviewQueueItem({
    type: input.type,
    workspaceId,
    entityType: input.entityType,
    entityId: input.entityId,
    sourceId: input.sourceId,
    dedupeKey: input.dedupeKey,
  });

  if (existing) {
    return (await reviewQueueItemDb().update({
      where: { id: existing.id },
      data: {
        priority: input.priority ?? existing.priority,
        title: input.title ?? existing.title,
        reason: input.reason ?? existing.reason,
        metadata: meta ?? existing.metadata,
        updatedAt: new Date(),
      } as never,
    })) as ReviewQueueItemRow;
  }

  return (await reviewQueueItemDb().create({
    data: {
      workspaceId,
      type: input.type as never,
      status: "OPEN" as never,
      priority: input.priority ?? 50,
      title: input.title,
      reason: input.reason,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      sourceId: input.sourceId ?? null,
      metadata: meta ?? undefined,
    } as never,
  })) as ReviewQueueItemRow;
}

export async function patchReviewQueueItem(
  id: string,
  patch: {
    status?: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
    priority?: number;
    resolutionNote?: string | null;
  }
): Promise<ReviewQueueItemRow> {
  const status = patch.status;
  const reviewedAt = status === "RESOLVED" || status === "DISMISSED" ? new Date() : undefined;

  return (await reviewQueueItemDb().update({
    where: { id },
    data: {
      ...(patch.priority != null ? { priority: patch.priority } : {}),
      ...(patch.resolutionNote !== undefined ? { resolutionNote: patch.resolutionNote } : {}),
      ...(status ? { status: status as never } : {}),
      ...(reviewedAt ? { reviewedAt } : {}),
    } as never,
  })) as ReviewQueueItemRow;
}
