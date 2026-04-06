import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { normalizeUrl } from "@/lib/url";
import { IntelligenceSignalRepository } from "@/server/repositories/intelligence-signal.repository";
import type { SignalSeverity } from "@prisma/client";

function severityFor(confidence: number): SignalSeverity {
  if (confidence >= 0.85) return "HIGH";
  if (confidence >= 0.65) return "MEDIUM";
  if (confidence >= 0.45) return "LOW";
  return "INFO";
}

export interface SignalSweepResult {
  written: number;
}

export async function runSignalSweep(): Promise<SignalSweepResult> {
  let written = 0;

  const adCanonGroups = await prisma.ad.groupBy({
    by: ["canonicalUrl"],
    where: { NOT: { canonicalUrl: null } },
    _count: { _all: true },
  });
  for (const g of adCanonGroups) {
    if (!g.canonicalUrl || g._count._all < 2) continue;
    const ads = await prisma.ad.findMany({
      where: { canonicalUrl: g.canonicalUrl },
      select: { id: true },
      take: 40,
    });
    const ids = ads.map((a) => a.id);
    const key = IntelligenceSignalRepository.buildDedupeKey("repeated_ad_destination", [
      g.canonicalUrl,
    ]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "repeated_ad_destination",
      severity: severityFor(Math.min(1, 0.5 + g._count._all * 0.05)),
      confidence: Math.min(1, 0.55 + g._count._all * 0.04),
      relatedEntityIds: ids,
      evidence: { canonicalUrl: g.canonicalUrl, count: g._count._all },
      dedupeKey: key,
    });
    written++;
  }

  const storeAdCounts = await prisma.inferredLink.groupBy({
    by: ["toEntityId"],
    where: { toEntityType: "STORE", fromEntityType: "AD" },
    _count: { _all: true },
  });
  for (const row of storeAdCounts) {
    if (row._count._all < 3) continue;
    const key = IntelligenceSignalRepository.buildDedupeKey("multi_ad_same_store", [row.toEntityId]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "multi_ad_same_store",
      severity: row._count._all >= 8 ? "MEDIUM" : "LOW",
      confidence: Math.min(1, 0.45 + row._count._all * 0.03),
      relatedEntityIds: [row.toEntityId],
      evidence: { adInferredEdges: row._count._all },
      dedupeKey: key,
    });
    written++;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const recentProducts = await prisma.product.groupBy({
    by: ["storeId"],
    where: { firstSeenAt: { gte: sevenDaysAgo } },
    _count: { _all: true },
  });
  for (const r of recentProducts) {
    if (r._count._all < 15) continue;
    const key = IntelligenceSignalRepository.buildDedupeKey("high_product_growth", [r.storeId]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "high_product_growth",
      severity: "LOW",
      confidence: Math.min(1, 0.5 + r._count._all * 0.01),
      relatedEntityIds: [r.storeId],
      evidence: { newProducts7d: r._count._all },
      dedupeKey: key,
    });
    written++;
  }

  const staleCutoff = new Date(Date.now() - 45 * 86400000);
  const staleStores = await prisma.store.findMany({
    where: { lastSeenAt: { lt: staleCutoff } },
    select: { id: true },
    take: 200,
  });
  for (const s of staleStores) {
    const key = IntelligenceSignalRepository.buildDedupeKey("stale_store", [s.id]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "stale_store",
      severity: "MEDIUM",
      confidence: 0.7,
      relatedEntityIds: [s.id],
      evidence: { lastSeenBefore: staleCutoff.toISOString() },
      dedupeKey: key,
    });
    written++;
  }

  const orphanLps = await prisma.landingPage.findMany({
    where: {
      ads: { none: {} },
      entityLinks: { none: { entityType: "STORE" } },
    },
    select: { id: true },
    take: 150,
  });
  for (const lp of orphanLps) {
    const infStore = await prisma.inferredLink.findFirst({
      where: { fromEntityId: lp.id, fromEntityType: "LANDING_PAGE", toEntityType: "STORE" },
    });
    if (infStore) continue;
    const key = IntelligenceSignalRepository.buildDedupeKey("orphan_landing_page", [lp.id]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "orphan_landing_page",
      severity: "LOW",
      confidence: 0.55,
      relatedEntityIds: [lp.id],
      evidence: { reason: "no_ads_and_no_store_lineage" },
      dedupeKey: key,
    });
    written++;
  }

  const dupProd = await prisma.product.groupBy({
    by: ["storeId", "handle"],
    _count: { _all: true },
  });
  let dupClusterSignals = 0;
  for (const d of dupProd) {
    if (d._count._all < 2) continue;
    if (dupClusterSignals >= 80) break;
    const rows = await prisma.product.findMany({
      where: { storeId: d.storeId, handle: d.handle },
      select: { id: true },
      take: 15,
    });
    const key = IntelligenceSignalRepository.buildDedupeKey("duplicate_product_cluster", [
      d.storeId,
      d.handle,
    ]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "duplicate_product_cluster",
      severity: "HIGH",
      confidence: 0.82,
      relatedEntityIds: rows.map((r) => r.id),
      evidence: { storeId: d.storeId, handle: d.handle, count: d._count._all },
      dedupeKey: key,
    });
    written++;
    dupClusterSignals++;
  }

  const storesWeak = await prisma.store.findMany({
    take: 200,
    orderBy: { lastSeenAt: "desc" },
    include: {
      confidenceScores: { take: 1 },
    },
  });
  for (const s of storesWeak) {
    const sc = s.confidenceScores[0];
    if (!sc || sc.completenessScore >= 0.45) continue;
    const key = IntelligenceSignalRepository.buildDedupeKey("weak_store_extraction", [s.id]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "weak_store_extraction",
      severity: "LOW",
      confidence: 0.58,
      relatedEntityIds: [s.id],
      evidence: { completenessScore: sc.completenessScore },
      dedupeKey: key,
    });
    written++;
  }

  const domainActivity = await prisma.landingPage.groupBy({
    by: ["domain"],
    _count: { _all: true },
  });
  for (const d of domainActivity) {
    if (d._count._all < 6) continue;
    const key = IntelligenceSignalRepository.buildDedupeKey("rising_domain_activity", [d.domain]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "rising_domain_activity",
      severity: "INFO",
      confidence: Math.min(1, 0.4 + d._count._all * 0.02),
      relatedEntityIds: [d.domain],
      evidence: { landingPageCount: d._count._all },
      dedupeKey: key,
    });
    written++;
  }

  const adsBroken = await prisma.ad.findMany({
    where: {
      OR: [{ destinationUrl: { not: null } }, { canonicalUrl: { not: null } }],
    },
    select: { id: true, destinationUrl: true, canonicalUrl: true },
    take: 400,
  });
  for (const a of adsBroken) {
    const u = a.canonicalUrl || a.destinationUrl;
    if (!u) continue;
    if (normalizeUrl(u)) continue;
    const key = IntelligenceSignalRepository.buildDedupeKey("broken_landing_reference", [a.id]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "broken_landing_reference",
      severity: "MEDIUM",
      confidence: 0.62,
      relatedEntityIds: [a.id],
      evidence: { rawUrl: u },
      dedupeKey: key,
    });
    written++;
  }

  const crossStoreHandles = await prisma.$queryRaw<{ handle: string }[]>(Prisma.sql`
    SELECT handle FROM "Product"
    GROUP BY handle
    HAVING COUNT(DISTINCT "storeId")::int >= 3
    LIMIT 50
  `);
  for (const row of crossStoreHandles) {
    const prods = await prisma.product.findMany({
      where: { handle: row.handle },
      select: { id: true, storeId: true },
      take: 25,
    });
    const storeIds = [...new Set(prods.map((p) => p.storeId))];
    const key = IntelligenceSignalRepository.buildDedupeKey("recurring_handle_conflict", [
      row.handle,
    ]);
    await IntelligenceSignalRepository.upsertSignal({
      type: "recurring_handle_conflict",
      severity: "LOW",
      confidence: 0.48,
      relatedEntityIds: prods.map((p) => p.id),
      evidence: { handle: row.handle, distinctStores: storeIds.length, storeIds },
      dedupeKey: key,
    });
    written++;
  }

  return { written };
}
