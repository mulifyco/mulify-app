import prisma from "@/lib/prisma";
import type { EntityType, ConfidenceLevel, Prisma } from "@prisma/client";
import {
  computeConfidence,
  measureFieldCompleteness,
  COMPLETENESS_FIELDS,
} from "@/lib/confidence";
import type { ConfidenceBreakdownV2, IntelligenceReasonCode } from "@/server/intelligence/types";
import { CONFIDENCE_V2_VERSION } from "@/server/intelligence/types";
import { isValidUrl } from "@/lib/url";

const W_V2 = {
  fieldCompleteness: 0.14,
  repeatedConfirmations: 0.12,
  sourceDiversityBonus: 0.06,
  linkedStore: 0.1,
  linkedLandingPage: 0.1,
  productGraphDepth: 0.08,
  collectionConsistency: 0.08,
  domainConfirmation: 0.07,
  rawLineage: 0.1,
  recentSuccessfulSyncs: 0.15,
};

export function normalizeScore01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, Math.round(x * 1000) / 1000));
}

function levelFromScore(score: number): ConfidenceLevel {
  if (score >= 0.8) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
}

function entityLineageWhere(entityType: EntityType, entityId: string): Prisma.EntityLinkWhereInput {
  const base: Prisma.EntityLinkWhereInput = { entityType, entityId };
  switch (entityType) {
    case "AD":
      return { OR: [base, { adId: entityId }] };
    case "STORE":
      return { OR: [base, { storeId: entityId }] };
    case "PRODUCT":
      return { OR: [base, { productId: entityId }] };
    case "COLLECTION":
      return { OR: [base, { collectionId: entityId }] };
    case "LANDING_PAGE":
      return { OR: [base, { landingPageId: entityId }] };
    default:
      return base;
  }
}

async function distinctSourceCountForEntity(entityType: EntityType, entityId: string): Promise<number> {
  const links = await prisma.entityLink.findMany({
    where: entityLineageWhere(entityType, entityId),
    select: {
      rawRecord: { select: { sourceId: true } },
    },
    take: 500,
  });
  return new Set(links.map((l) => l.rawRecord?.sourceId).filter(Boolean)).size;
}

async function recentCompletedJobsCount(since: Date): Promise<number> {
  return prisma.ingestionJob.count({
    where: {
      status: "COMPLETED",
      completedAt: { gte: since },
    },
  });
}

export async function buildBreakdownV2ForEntity(
  entityType: EntityType,
  entityId: string
): Promise<{ breakdown: ConfidenceBreakdownV2; reasonCodes: IntelligenceReasonCode[] }> {
  const reasonCodes: IntelligenceReasonCode[] = [];
  const humanWarnings: string[] = [];

  const scoreRow = await prisma.confidenceScore.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
  });

  const syncCount = scoreRow?.syncCount ?? 1;
  const repeatedConfirmations = Math.min(1, 0.25 + (syncCount - 1) * 0.12);

  const lineageCount = await prisma.entityLink.count({
    where: entityLineageWhere(entityType, entityId),
  });
  const rawLineage = Math.min(1, lineageCount * 0.15);

  const sources = await distinctSourceCountForEntity(entityType, entityId);
  const sourceDiversityBonus = sources <= 1 ? 0.35 : Math.min(1, 0.5 + sources * 0.15);
  if (sources <= 1) reasonCodes.push("SINGLE_SOURCE_ONLY");

  const since = new Date(Date.now() - 14 * 86400000);
  const recentSyncs = await recentCompletedJobsCount(since);
  const recentSuccessfulSyncs = Math.min(1, recentSyncs / 20);

  let fieldCompleteness = 0.5;
  let linkedStore = 0;
  let linkedLandingPage = 0;
  let productGraphDepth = 0;
  let collectionConsistency = 0;
  let domainConfirmation = 0;
  let stalePenalty = 0;
  let orphanPenalty = 0;
  let duplicateConflictPenalty = 0;
  let brokenLandingReferencePenalty = 0;

  if (entityType === "AD") {
    const ad = await prisma.ad.findUnique({
      where: { id: entityId },
      include: {
        landingPages: { select: { id: true, domain: true } },
        entityLinks: { where: { entityType: "STORE" }, take: 5 },
      },
    });
    if (ad) {
      fieldCompleteness = measureFieldCompleteness(ad as never, [...COMPLETENESS_FIELDS.AD]);
      linkedLandingPage = ad.landingPages.length > 0 ? 1 : 0;
      linkedStore = ad.entityLinks.length > 0 ? 1 : 0;
      domainConfirmation =
        ad.landingPages.length > 0 && ad.canonicalUrl
          ? Math.min(
              1,
              ad.landingPages.filter((lp) => ad.canonicalUrl?.includes(lp.domain)).length * 0.35
            )
          : 0;
      const days = (Date.now() - ad.lastSeenAt.getTime()) / 86400000;
      if (days > 60) {
        stalePenalty = 0.12;
        reasonCodes.push("STALE_ENTITY");
        humanWarnings.push("Ad not seen in 60+ days");
      }
      if (!ad.destinationUrl && !ad.canonicalUrl) {
        orphanPenalty = 0.18;
        reasonCodes.push("ORPHAN_GRAPH");
        humanWarnings.push("No destination URL to resolve graph");
      }
      const dest = ad.destinationUrl || ad.canonicalUrl;
      if (dest && !isValidUrl(dest)) {
        brokenLandingReferencePenalty = 0.22;
        reasonCodes.push("BROKEN_LANDING_URL");
        humanWarnings.push("Destination URL fails validation");
      }
    }
  } else if (entityType === "STORE") {
    const store = await prisma.store.findUnique({
      where: { id: entityId },
      include: {
        _count: { select: { products: true, collections: true } },
      },
    });
    if (store) {
      fieldCompleteness = measureFieldCompleteness(store as never, [...COMPLETENESS_FIELDS.STORE]);
      productGraphDepth = Math.min(1, Math.log10(store._count.products + 1) / 3);
      const lpEdges = await prisma.entityLink.count({
        where: { storeId: entityId, landingPageId: { not: null } },
      });
      linkedLandingPage = lpEdges > 0 ? 1 : 0;
      collectionConsistency =
        store._count.collections > 0 && store._count.products > 0
          ? Math.min(1, store._count.collections / (store._count.products * 0.05 + 1))
          : 0.2;
      const days = (Date.now() - store.lastSeenAt.getTime()) / 86400000;
      if (days > 30) {
        stalePenalty = 0.1;
        reasonCodes.push("STALE_ENTITY");
        humanWarnings.push("Store quiet for 30+ days");
      }
      if (fieldCompleteness < 0.35) {
        reasonCodes.push("WEAK_STORE_EXTRACTION");
        humanWarnings.push("Sparse store profile fields");
      }
    }
  } else if (entityType === "PRODUCT") {
    const product = await prisma.product.findUnique({
      where: { id: entityId },
      include: {
        collectionMemberships: { take: 20 },
        entityLinks: true,
        store: true,
      },
    });
    if (product) {
      fieldCompleteness = measureFieldCompleteness(product as never, [...COMPLETENESS_FIELDS.PRODUCT]);
      linkedStore = 1;
      collectionConsistency =
        product.collectionMemberships.length > 0
          ? Math.min(1, product.collectionMemberships.length / 5)
          : 0.15;
      productGraphDepth = 0.4;
      const dup = await prisma.product.count({
        where: { storeId: product.storeId, handle: product.handle },
      });
      if (dup > 1) {
        duplicateConflictPenalty = 0.2;
        reasonCodes.push("DUPLICATE_CONFLICT");
        humanWarnings.push("Duplicate handle rows in same store");
      }
    }
  } else if (entityType === "LANDING_PAGE") {
    const lp = await prisma.landingPage.findUnique({
      where: { id: entityId },
      include: {
        ads: { select: { id: true } },
        entityLinks: true,
      },
    });
    if (lp) {
      fieldCompleteness = measureFieldCompleteness(lp as never, [...COMPLETENESS_FIELDS.LANDING_PAGE]);
      linkedLandingPage = 1;
      const storeLink =
        lp.entityLinks.some((l) => l.entityType === "STORE") ||
        (await prisma.inferredLink.findFirst({
          where: {
            fromEntityType: "LANDING_PAGE",
            fromEntityId: lp.id,
            toEntityType: "STORE",
          },
        }));
      linkedStore = storeLink ? 1 : 0;
      if (lp.ads.length === 0 && !storeLink) {
        orphanPenalty = 0.2;
        reasonCodes.push("ORPHAN_GRAPH");
        humanWarnings.push("Landing page not tied to ads or store graph");
      }
      if (!isValidUrl(lp.url)) {
        brokenLandingReferencePenalty = 0.25;
        reasonCodes.push("BROKEN_LANDING_URL");
      }
    }
  } else if (entityType === "COLLECTION") {
    const col = await prisma.collection.findUnique({
      where: { id: entityId },
      include: { _count: { select: { products: true } } },
    });
    if (col) {
      fieldCompleteness = measureFieldCompleteness(col as never, [...COMPLETENESS_FIELDS.COLLECTION]);
      collectionConsistency = Math.min(1, col._count.products / 10);
      linkedStore = 1;
    }
  }

  if (fieldCompleteness < 0.4) reasonCodes.push("FIELD_SPARSE");
  if (syncCount < 2) reasonCodes.push("LOW_SYNC_CONFIRMATION");
  if (linkedStore > 0.5) reasonCodes.push("LINKED_STORE");
  if (linkedLandingPage > 0.5) reasonCodes.push("LINKED_LANDING_PAGE");
  if (productGraphDepth > 0.5) reasonCodes.push("DEEP_PRODUCT_GRAPH");
  if (collectionConsistency > 0.45) reasonCodes.push("COLLECTION_ALIGNED");
  if (domainConfirmation > 0.2) reasonCodes.push("DOMAIN_REPEATED");
  if (rawLineage > 0.3) reasonCodes.push("RAW_LINEAGE_STRONG");
  if (recentSuccessfulSyncs > 0.35) reasonCodes.push("RECENT_SYNC_HEALTHY");

  const base =
    W_V2.fieldCompleteness * fieldCompleteness +
    W_V2.repeatedConfirmations * repeatedConfirmations +
    W_V2.sourceDiversityBonus * sourceDiversityBonus +
    W_V2.linkedStore * linkedStore +
    W_V2.linkedLandingPage * linkedLandingPage +
    W_V2.productGraphDepth * productGraphDepth +
    W_V2.collectionConsistency * collectionConsistency +
    W_V2.domainConfirmation * domainConfirmation +
    W_V2.rawLineage * rawLineage +
    W_V2.recentSuccessfulSyncs * recentSuccessfulSyncs;

  const penalties =
    stalePenalty +
    orphanPenalty +
    duplicateConflictPenalty +
    brokenLandingReferencePenalty;

  const normalizedOverall = normalizeScore01(base - penalties);

  const breakdown: ConfidenceBreakdownV2 = {
    version: CONFIDENCE_V2_VERSION,
    normalizedOverall,
    components: {
      fieldCompleteness,
      repeatedConfirmations,
      sourceDiversityBonus,
      linkedStore,
      linkedLandingPage,
      productGraphDepth,
      collectionConsistency,
      domainConfirmation,
      rawLineage,
      recentSuccessfulSyncs,
    },
    penalties: {
      stale: stalePenalty,
      orphan: orphanPenalty,
      duplicateConflict: duplicateConflictPenalty,
      brokenLandingReference: brokenLandingReferencePenalty,
    },
    humanWarnings,
  };

  return { breakdown, reasonCodes };
}

export async function persistConfidenceV2(
  entityType: EntityType,
  entityId: string,
  options: { syncLegacyScores?: boolean } = {}
): Promise<void> {
  const { breakdown, reasonCodes } = await buildBreakdownV2ForEntity(entityType, entityId);

  const existing = await prisma.confidenceScore.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
  });

  const hint = {
    isOfficialApiSource: true,
    fieldCompleteness: breakdown.components.fieldCompleteness,
    syncCount: existing?.syncCount ?? 1,
    hasValidUrls: breakdown.penalties.brokenLandingReference < 0.1,
    linkedEntityCount:
      (breakdown.components.linkedStore > 0 ? 1 : 0) +
      (breakdown.components.linkedLandingPage > 0 ? 1 : 0) +
      Math.round(breakdown.components.rawLineage * 5),
  };

  const scored = computeConfidence({
    entityType: entityType as import("@/types").EntityType,
    entityId,
    ...hint,
  });

  const mergeBreakdown = {
    ...(typeof existing?.breakdown === "object" && existing?.breakdown !== null
      ? (existing.breakdown as object)
      : {}),
    intelligenceV2: breakdown,
  };

  if (existing) {
    await prisma.confidenceScore.update({
      where: { entityType_entityId: { entityType, entityId } },
      data: {
        breakdown: mergeBreakdown as never,
        breakdownV2: breakdown as never,
        reasonCodes: [...new Set([...(existing.reasonCodes ?? []), ...reasonCodes])],
        scoringVersion: CONFIDENCE_V2_VERSION,
        ...(options.syncLegacyScores
          ? {
              overallScore: normalizeScore01(
                0.5 * existing.overallScore + 0.5 * breakdown.normalizedOverall
              ),
              level: levelFromScore(
                0.5 * existing.overallScore + 0.5 * breakdown.normalizedOverall
              ),
              linkageScore: normalizeScore01(
                existing.linkageScore * 0.4 + breakdown.components.linkedStore * 0.3 + breakdown.components.linkedLandingPage * 0.3
              ),
            }
          : {}),
        lastScoredAt: new Date(),
      },
    });
  } else {
    const fk =
      entityType === "AD"
        ? { adId: entityId }
        : entityType === "STORE"
          ? { storeId: entityId }
          : entityType === "PRODUCT"
            ? { productId: entityId }
            : entityType === "COLLECTION"
              ? { collectionId: entityId }
              : { landingPageId: entityId };

    await prisma.confidenceScore.create({
      data: {
        entityType,
        entityId,
        overallScore: options.syncLegacyScores
          ? breakdown.normalizedOverall
          : scored.overallScore,
        level: options.syncLegacyScores
          ? levelFromScore(breakdown.normalizedOverall)
          : scored.level,
        sourceScore: scored.sourceScore,
        completenessScore: scored.completenessScore,
        confirmationScore: scored.confirmationScore,
        urlValidityScore: scored.urlValidityScore,
        linkageScore: scored.linkageScore,
        breakdown: { ...scored.details, intelligenceV2: breakdown } as never,
        breakdownV2: breakdown as never,
        reasonCodes,
        scoringVersion: CONFIDENCE_V2_VERSION,
        syncCount: scored.syncCount,
        ...fk,
      },
    });
  }
}

export async function batchRecomputeConfidenceV2(options: {
  entityTypes?: EntityType[];
  limitPerType?: number;
  syncLegacyScores?: boolean;
} = {}): Promise<{ updated: number }> {
  const types = options.entityTypes ?? ["AD", "STORE", "PRODUCT", "LANDING_PAGE", "COLLECTION"];
  const limit = options.limitPerType ?? 400;
  let updated = 0;

  for (const t of types) {
    if (t === "AD") {
      const rows = await prisma.ad.findMany({ select: { id: true }, take: limit });
      for (const r of rows) {
        await persistConfidenceV2("AD", r.id, { syncLegacyScores: options.syncLegacyScores });
        updated++;
      }
    } else if (t === "STORE") {
      const rows = await prisma.store.findMany({ select: { id: true }, take: limit });
      for (const r of rows) {
        await persistConfidenceV2("STORE", r.id, { syncLegacyScores: options.syncLegacyScores });
        updated++;
      }
    } else if (t === "PRODUCT") {
      const rows = await prisma.product.findMany({ select: { id: true }, take: limit });
      for (const r of rows) {
        await persistConfidenceV2("PRODUCT", r.id, { syncLegacyScores: options.syncLegacyScores });
        updated++;
      }
    } else if (t === "LANDING_PAGE") {
      const rows = await prisma.landingPage.findMany({ select: { id: true }, take: limit });
      for (const r of rows) {
        await persistConfidenceV2("LANDING_PAGE", r.id, {
          syncLegacyScores: options.syncLegacyScores,
        });
        updated++;
      }
    } else if (t === "COLLECTION") {
      const rows = await prisma.collection.findMany({ select: { id: true }, take: limit });
      for (const r of rows) {
        await persistConfidenceV2("COLLECTION", r.id, {
          syncLegacyScores: options.syncLegacyScores,
        });
        updated++;
      }
    }
  }

  return { updated };
}
