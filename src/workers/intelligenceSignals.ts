import prisma from "@/src/lib/prisma";
import { IntelligenceSignalRepository } from "@/server/repositories/intelligence-signal.repository";
import { openReviewQueueItem } from "@/server/services/review-queue.service";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Phase-1 product/store intelligence signals.
 *
 * Stores evidence into `IntelligenceSignal` so existing UI panels can render it
 * without schema changes or breaking pages.
 */
export async function refreshIntelligenceSignalsJob(): Promise<{
  productsUpdated: number;
  storesUpdated: number;
}> {
  const maxProducts = Number.parseInt(process.env.INTEL_MAX_PRODUCTS_PER_TICK ?? "40", 10) || 40;
  const maxStores = Number.parseInt(process.env.INTEL_MAX_STORES_PER_TICK ?? "20", 10) || 20;

  const [products, stores] = await Promise.all([
    prisma.product.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: maxProducts,
      select: {
        id: true,
        storeId: true,
        handle: true,
        firstSeenAt: true,
        lastSeenAt: true,
        _count: { select: { entityLinks: true, collectionMemberships: true } },
      },
    }),
    prisma.store.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: maxStores,
      select: {
        id: true,
        domain: true,
        firstSeenAt: true,
        lastSeenAt: true,
        _count: { select: { products: true, collections: true, entityLinks: true } },
      },
    }),
  ]);

  let productsUpdated = 0;
  for (const p of products) {
    // Global-ish saturation proxy: how many stores share the same handle (very rough placeholder).
    const storeCountSameHandle = await prisma.product
      .groupBy({
        by: ["storeId"],
        where: { handle: p.handle },
        _count: true,
      })
      .then((rows) => rows.length)
      .catch(() => 1);

    const saturationScorePlaceholder = Math.round(clamp01(storeCountSameHandle / 25) * 100);
    const winningScorePlaceholder = null;

    const type = "product_intelligence_v1";
    const dedupeKey = IntelligenceSignalRepository.buildDedupeKey(type, [p.id]);
    await IntelligenceSignalRepository.upsertSignal({
      type,
      severity: "INFO",
      confidence: 0.6,
      relatedEntityIds: [p.id] as never,
      evidence: {
        storeCount: storeCountSameHandle,
        collectionCount: p._count.collectionMemberships,
        linkedRawRecordCount: p._count.entityLinks,
        firstSeenAt: p.firstSeenAt.toISOString(),
        lastSeenAt: p.lastSeenAt.toISOString(),
        saturationScore: saturationScorePlaceholder,
        winningScore: winningScorePlaceholder,
        note: "Phase 1 placeholders; refine with real demand/ads/traffic signals in Phase 2.",
      } as never,
      dedupeKey,
    });
    productsUpdated++;
  }

  let storesUpdated = 0;
  for (const s of stores) {
    const type = "store_intelligence_v1";
    const dedupeKey = IntelligenceSignalRepository.buildDedupeKey(type, [s.id]);
    await IntelligenceSignalRepository.upsertSignal({
      type,
      severity: "INFO",
      confidence: 0.65,
      relatedEntityIds: [s.id] as never,
      evidence: {
        productCount: s._count.products,
        collectionCount: s._count.collections,
        linkedRawRecordCount: s._count.entityLinks,
        firstSeenAt: s.firstSeenAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        saturationScore: null,
        winningScore: null,
      } as never,
      dedupeKey,
    });
    storesUpdated++;
  }

  // Manual review: high-score product clusters with weak linkage evidence.
  // Best-effort and capped to avoid slowing the worker tick.
  const reviewMax = Number.parseInt(process.env.REVIEW_QUEUE_MAX_PER_TICK ?? "12", 10) || 12;
  const clusters = await prisma.productCluster
    .findMany({
      where: {
        OR: [
          { readyToScaleScore: { gte: 85 } },
          { earlyMoverScore: { gte: 85 } },
          { marketLeaderScore: { gte: 90 } },
        ],
        linkedRawRecordCount: { lt: 3 },
      },
      orderBy: [{ lastSeenAt: "desc" }],
      take: Math.min(40, reviewMax * 3),
      select: {
        id: true,
        readyToScaleScore: true,
        earlyMoverScore: true,
        marketLeaderScore: true,
        linkedRawRecordCount: true,
        storeCount: true,
        lastSeenAt: true,
      },
    })
    .catch(() => []);

  for (const c of clusters.slice(0, reviewMax)) {
    const primary = await prisma.productClusterMember
      .findFirst({
        where: { clusterId: c.id },
        select: { productId: true },
        orderBy: { updatedAt: "desc" },
      })
      .catch(() => null);

    const score = Math.max(
      Number(c.readyToScaleScore ?? 0),
      Number(c.earlyMoverScore ?? 0),
      Number(c.marketLeaderScore ?? 0)
    );

    await openReviewQueueItem({
      type: "HIGH_SCORE_UNVERIFIED_ITEM",
      priority: Math.min(97, 70 + Math.floor(score / 2)),
      title: `High-score cluster with weak links`,
      reason: `score:${Math.round(score)} · linkedRaw:${c.linkedRawRecordCount} · stores:${c.storeCount ?? 0} · cluster:${c.id}`.slice(
        0,
        420
      ),
      entityType: primary?.productId ? "PRODUCT" : null,
      entityId: primary?.productId ?? null,
      metadata: {
        clusterId: c.id,
        score,
        readyToScaleScore: c.readyToScaleScore,
        earlyMoverScore: c.earlyMoverScore,
        marketLeaderScore: c.marketLeaderScore,
        linkedRawRecordCount: c.linkedRawRecordCount,
        storeCount: c.storeCount,
        lastSeenAt: c.lastSeenAt?.toISOString?.() ?? null,
      },
    }).catch(() => null);
  }

  return { productsUpdated, storesUpdated };
}

