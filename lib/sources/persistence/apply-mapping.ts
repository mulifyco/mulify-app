/**
 * Maps portable normalization output → Prisma upserts + entity links + confidence.
 * Adapters stay free of ORM code; this module is the single persistence bridge.
 */

import type { MappingResult } from "@/lib/sources/shared/types";
import prisma from "@/lib/prisma";
import { computeConfidence } from "@/lib/confidence";
import { logger } from "@/lib/logger";
import type { EntityType } from "@/types";
import { normalizeShopifyDomain, normalizeUrl } from "@/lib/url";
import { canonicalStoreDomainForEntity } from "@/lib/intelligence/entity-identity";
import { openReviewQueueItem } from "@/server/services/review-queue.service";
import { landingPageFieldsFromNormalizedUrl } from "@/server/intelligence/url-normalize";
import {
  syncShopifyLandingGraphFromCollection,
  syncShopifyLandingGraphFromProduct,
  syncShopifyLandingGraphFromStore,
} from "@/lib/sources/persistence/shopify-landing-graph";

function asRecordObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {};
}

export async function applyMappingResult(params: {
  mapping: MappingResult;
  rawRecordId: string;
}): Promise<void> {
  const { mapping, rawRecordId } = params;
  const e = mapping.entity;
  switch (e.type) {
    case "AD":
      await applyAd(mapping as MappingResult & { entity: { type: "AD" } }, rawRecordId);
      return;
    case "STORE":
      await applyStore(mapping as MappingResult & { entity: { type: "STORE" } }, rawRecordId);
      return;
    case "PRODUCT":
      await applyProduct(mapping as MappingResult & { entity: { type: "PRODUCT" } }, rawRecordId);
      return;
    case "COLLECTION":
      await applyCollection(mapping as MappingResult & { entity: { type: "COLLECTION" } }, rawRecordId);
      return;
    case "LANDING_PAGE":
      await applyLandingPage(
        mapping as MappingResult & { entity: { type: "LANDING_PAGE" } },
        rawRecordId
      );
      return;
  }
}

async function applyAd(m: MappingResult & { entity: { type: "AD" } }, rawRecordId: string) {
  const d = m.entity.data;
  const primaryPlatform =
    d.platform ?? (d.platforms?.length ? d.platforms[0] : undefined) ?? "UNKNOWN";
  const ad = await prisma.ad.upsert({
    where: { externalId: d.externalId },
    create: {
      externalId: d.externalId,
      platform: primaryPlatform,
      creativeType: d.creativeType ?? "UNKNOWN",
      creativeUrl: d.creativeUrl ?? null,
      thumbnailUrl: d.thumbnailUrl ?? null,
      pageId: d.pageId,
      pageName: d.pageName,
      pageUrl: d.pageUrl,
      adText: d.adText,
      adTitle: d.adTitle,
      adBody: d.adBody,
      callToAction: d.callToAction,
      adImageUrl: d.adImageUrl,
      adVideoUrl: d.adVideoUrl,
      destinationUrl: d.destinationUrl,
      canonicalUrl: d.canonicalUrl,
      platforms: d.platforms,
      countries: d.countries,
      startDate: d.startDate,
      endDate: d.endDate,
      isActive: d.isActive,
      impressionsMin: d.impressionsMin,
      impressionsMax: d.impressionsMax,
      spendMin: d.spendMin,
      spendMax: d.spendMax,
      currency: d.currency,
      metadata: d.metadata as never,
    },
    update: {
      platform: primaryPlatform,
      creativeType: d.creativeType ?? undefined,
      creativeUrl: d.creativeUrl,
      thumbnailUrl: d.thumbnailUrl,
      pageName: d.pageName,
      pageUrl: d.pageUrl,
      adText: d.adText,
      adTitle: d.adTitle,
      adBody: d.adBody,
      callToAction: d.callToAction,
      adImageUrl: d.adImageUrl,
      adVideoUrl: d.adVideoUrl,
      destinationUrl: d.destinationUrl,
      canonicalUrl: d.canonicalUrl,
      platforms: d.platforms,
      isActive: d.isActive,
      impressionsMin: d.impressionsMin,
      impressionsMax: d.impressionsMax,
      spendMin: d.spendMin,
      spendMax: d.spendMax,
      lastSeenAt: new Date(),
      metadata: d.metadata as never,
    },
  });

  await prisma.entityLink.upsert({
    where: {
      rawRecordId_entityType_entityId: {
        rawRecordId,
        entityType: "AD",
        entityId: ad.id,
      },
    },
    create: { rawRecordId, entityType: "AD", entityId: ad.id, adId: ad.id },
    update: {},
  });

  // Best-effort: connect ad → landing pages when we have destination hints.
  // Keeps discovery / compare / boards fed even when users don't add sources manually.
  try {
    const meta = (d.metadata ?? {}) as Record<string, unknown>;
    const rawCandidates = Array.isArray(meta.destinationUrlCandidates)
      ? (meta.destinationUrlCandidates as unknown[])
      : [];
    const candidates = [
      ...(typeof d.destinationUrl === "string" ? [d.destinationUrl] : []),
      ...rawCandidates.filter((x): x is string => typeof x === "string"),
    ]
      .map((u) => normalizeUrl(u))
      .filter((u): u is string => Boolean(u))
      .slice(0, 3);

    for (const norm of candidates) {
      const fields = landingPageFieldsFromNormalizedUrl(norm);
      if (!fields) continue;
      const lp = await prisma.landingPage.upsert({
        where: { url: fields.url },
        create: { url: fields.url, domain: fields.domain, path: fields.path },
        update: { lastSeenAt: new Date(), domain: fields.domain, path: fields.path },
      });

      await prisma.ad.update({
        where: { id: ad.id },
        data: { landingPages: { connect: { id: lp.id } } },
      });

      await prisma.entityLink
        .upsert({
          where: {
            rawRecordId_entityType_entityId: {
              rawRecordId,
              entityType: "LANDING_PAGE",
              entityId: lp.id,
            },
          },
          create: {
            rawRecordId,
            entityType: "LANDING_PAGE",
            entityId: lp.id,
            landingPageId: lp.id,
            linkStrength: 0.72,
            linkProvenance: "ad_destination_url",
            firstConfirmedAt: new Date(),
            lastConfirmedAt: new Date(),
          },
          update: {
            landingPageId: lp.id,
            linkStrength: 0.72,
            linkProvenance: "ad_destination_url",
            lastConfirmedAt: new Date(),
            staleAt: null,
          },
        })
        .catch(() => null);
    }
  } catch {
    /* best-effort */
  }

  await prisma.rawRecord.update({
    where: { id: rawRecordId },
    data: { status: "NORMALIZED", normalizedAt: new Date(), processingError: null },
  });

  await upsertConfidenceFromHint("AD", ad.id, ad.id, m, 0);
}

async function applyStore(m: MappingResult & { entity: { type: "STORE" } }, rawRecordId: string) {
  const d = m.entity.data;
  const rawObserved = normalizeShopifyDomain(d.domain);
  const canonical = canonicalStoreDomainForEntity(d.domain) || rawObserved;
  if (!canonical) {
    logger.warn("apply_mapping.store_missing_domain", { rawRecordId });
    return;
  }

  const existing = await prisma.store.findUnique({
    where: { domain: canonical },
    select: { id: true, metadata: true },
  });

  const prev = asRecordObj(existing?.metadata);
  const incoming = asRecordObj(d.metadata);
  const aliasSet = new Set<string>();
  for (const x of Array.isArray(prev.domainAliases) ? (prev.domainAliases as unknown[]) : []) {
    if (typeof x === "string" && x.trim()) aliasSet.add(normalizeShopifyDomain(x));
  }
  if (rawObserved && rawObserved !== canonical) aliasSet.add(rawObserved);

  const mergedMetadata = {
    ...prev,
    ...incoming,
    domainAliases: [...aliasSet].filter(Boolean).slice(0, 32),
    entityQuality: {
      canonicalDomain: canonical,
      observedDomain: rawObserved,
      fieldCompleteness: m.confidence.fieldCompleteness,
      updatedAt: new Date().toISOString(),
    },
  };

  const store = await prisma.store.upsert({
    where: { domain: canonical },
    create: {
      domain: canonical,
      name: d.name,
      description: d.description,
      platform: d.platform,
      country: d.country,
      currency: d.currency,
      language: d.language,
      logoUrl: d.logoUrl,
      metaTitle: d.metaTitle,
      metaDescription: d.metaDescription,
      socialLinks: d.socialLinks as never,
      tags: d.tags,
      metadata: mergedMetadata as never,
      lastCrawledAt: new Date(),
    },
    update: {
      name: d.name ?? undefined,
      description: d.description ?? undefined,
      currency: d.currency ?? undefined,
      lastSeenAt: new Date(),
      lastCrawledAt: new Date(),
      metadata: mergedMetadata as never,
    },
  });

  if (rawObserved && rawObserved !== canonical) {
    const alt = await prisma.store.findUnique({ where: { domain: rawObserved }, select: { id: true } });
    if (alt && alt.id !== store.id) {
      const pair = [store.id, alt.id].sort().join(":");
      await openReviewQueueItem({
        type: "ENTITY_LINK_REVIEW",
        dedupeKey: `store_host_alias:${pair}`,
        title: `Store host alias: ${rawObserved} → ${canonical}`,
        reason:
          `Possible duplicate Store rows for one storefront (non-destructive). Canonical key: ${canonical}.`.slice(0, 420),
        entityType: "STORE",
        entityId: store.id,
        metadata: {
          kind: "STORE_CANONICAL_COLLISION",
          canonicalDomain: canonical,
          altDomain: rawObserved,
          altStoreId: alt.id,
          primaryStoreId: store.id,
        },
      }).catch(() => null);
    }
  }

  await prisma.entityLink.upsert({
    where: {
      rawRecordId_entityType_entityId: {
        rawRecordId,
        entityType: "STORE",
        entityId: store.id,
      },
    },
    create: { rawRecordId, entityType: "STORE", entityId: store.id, storeId: store.id },
    update: {},
  });

  await prisma.rawRecord.update({
    where: { id: rawRecordId },
    data: { status: "NORMALIZED", normalizedAt: new Date(), processingError: null },
  });

  await upsertConfidenceFromHint("STORE", store.id, store.id, m, 0);

  if (store.platform === "shopify") {
    try {
      await syncShopifyLandingGraphFromStore({
        rawRecordId,
        storeId: store.id,
        storeDomain: store.domain,
      });
    } catch (e) {
      logger.warn("apply_mapping.shopify_lp_graph_store_failed", {
        storeId: store.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function applyProduct(
  m: MappingResult & { entity: { type: "PRODUCT" } },
  rawRecordId: string
) {
  const d = m.entity.data;
  const storeDomainCanon = canonicalStoreDomainForEntity(d.storeDomain) || normalizeShopifyDomain(d.storeDomain);
  const store = await prisma.store.upsert({
    where: { domain: storeDomainCanon },
    create: { domain: storeDomainCanon, platform: "shopify" },
    update: { lastSeenAt: new Date() },
  });

  const product = await prisma.product.upsert({
    where: { storeId_handle: { storeId: store.id, handle: d.handle } },
    create: {
      storeId: store.id,
      externalId: d.externalId,
      handle: d.handle,
      title: d.title,
      description: d.description,
      vendor: d.vendor,
      productType: d.productType,
      tags: d.tags,
      url: d.url,
      canonicalUrl: d.canonicalUrl,
      featuredImage: d.featuredImage,
      images: d.images,
      priceMin: d.priceMin,
      priceMax: d.priceMax,
      currency: d.currency,
      isAvailable: d.isAvailable,
      publishedAt: d.publishedAt,
      metadata: { ...d.metadata, collectionHandles: d.collectionHandles } as never,
    },
    update: {
      title: d.title,
      vendor: d.vendor,
      tags: d.tags,
      priceMin: d.priceMin,
      priceMax: d.priceMax,
      isAvailable: d.isAvailable,
      featuredImage: d.featuredImage,
      images: d.images,
      lastSeenAt: new Date(),
      metadata: { ...d.metadata, collectionHandles: d.collectionHandles } as never,
    },
  });

  await prisma.entityLink.upsert({
    where: {
      rawRecordId_entityType_entityId: {
        rawRecordId,
        entityType: "PRODUCT",
        entityId: product.id,
      },
    },
    create: { rawRecordId, entityType: "PRODUCT", entityId: product.id, productId: product.id },
    update: {},
  });

  await prisma.rawRecord.update({
    where: { id: rawRecordId },
    data: { status: "NORMALIZED", normalizedAt: new Date(), processingError: null },
  });

  await upsertConfidenceFromHint("PRODUCT", product.id, product.id, m, 1);

  if (store.platform === "shopify") {
    try {
      await syncShopifyLandingGraphFromProduct({
        rawRecordId,
        storeId: store.id,
        storeDomain: store.domain,
        productId: product.id,
        productUrl: d.canonicalUrl || d.url,
        productHandle: d.handle,
      });
    } catch (e) {
      logger.warn("apply_mapping.shopify_lp_graph_product_failed", {
        productId: product.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function applyCollection(
  m: MappingResult & { entity: { type: "COLLECTION" } },
  rawRecordId: string
) {
  const d = m.entity.data;
  const storeDomainCanon = canonicalStoreDomainForEntity(d.storeDomain) || normalizeShopifyDomain(d.storeDomain);
  const store = await prisma.store.upsert({
    where: { domain: storeDomainCanon },
    create: { domain: storeDomainCanon, platform: "shopify" },
    update: { lastSeenAt: new Date() },
  });

  const collection = await prisma.collection.upsert({
    where: { storeId_handle: { storeId: store.id, handle: d.handle } },
    create: {
      storeId: store.id,
      externalId: d.externalId,
      handle: d.handle,
      title: d.title,
      description: d.description,
      url: d.url,
      canonicalUrl: d.canonicalUrl,
      featuredImage: d.featuredImage,
      productCount: d.productCount,
      metadata: d.metadata as never,
    },
    update: {
      title: d.title,
      description: d.description,
      featuredImage: d.featuredImage,
      productCount: d.productCount,
      lastSeenAt: new Date(),
      metadata: d.metadata as never,
    },
  });

  await prisma.entityLink.upsert({
    where: {
      rawRecordId_entityType_entityId: {
        rawRecordId,
        entityType: "COLLECTION",
        entityId: collection.id,
      },
    },
    create: {
      rawRecordId,
      entityType: "COLLECTION",
      entityId: collection.id,
      collectionId: collection.id,
    },
    update: {},
  });

  await prisma.rawRecord.update({
    where: { id: rawRecordId },
    data: { status: "NORMALIZED", normalizedAt: new Date(), processingError: null },
  });

  await upsertConfidenceFromHint("COLLECTION", collection.id, collection.id, m, 0);

  if (store.platform === "shopify") {
    try {
      await syncShopifyLandingGraphFromCollection({
        rawRecordId,
        storeId: store.id,
        storeDomain: store.domain,
        collectionId: collection.id,
        collectionUrl: d.canonicalUrl || d.url,
        collectionHandle: d.handle,
      });
    } catch (e) {
      logger.warn("apply_mapping.shopify_lp_graph_collection_failed", {
        collectionId: collection.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

async function applyLandingPage(
  m: MappingResult & { entity: { type: "LANDING_PAGE" } },
  rawRecordId: string
) {
  const d = m.entity.data;
  const lp = await prisma.landingPage.upsert({
    where: { url: d.url },
    create: {
      url: d.url,
      domain: d.domain,
      path: d.path,
      title: d.title,
      description: d.description,
      ogTitle: d.ogTitle,
      ogDescription: d.ogDescription,
      ogImage: d.ogImage,
      h1Text: d.h1Text,
      hasCheckout: d.hasCheckout,
      hasShopifySignal: d.hasShopifySignal,
      httpStatus: d.httpStatus,
      metadata: d.metadata as never,
    },
    update: {
      title: d.title,
      description: d.description,
      lastSeenAt: new Date(),
      metadata: d.metadata as never,
    },
  });

  await prisma.entityLink.upsert({
    where: {
      rawRecordId_entityType_entityId: {
        rawRecordId,
        entityType: "LANDING_PAGE",
        entityId: lp.id,
      },
    },
    create: {
      rawRecordId,
      entityType: "LANDING_PAGE",
      entityId: lp.id,
      landingPageId: lp.id,
    },
    update: {},
  });

  await prisma.rawRecord.update({
    where: { id: rawRecordId },
    data: { status: "NORMALIZED", normalizedAt: new Date(), processingError: null },
  });

  await upsertConfidenceFromHint("LANDING_PAGE", lp.id, lp.id, m, 0);
}

async function upsertConfidenceFromHint(
  entityType: EntityType,
  entityId: string,
  fkId: string,
  m: MappingResult,
  linkedEntityCount: number
) {
  const hint = m.confidence;
  const existingScore = await prisma.confidenceScore.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
  });

  const scored = computeConfidence({
    entityType,
    entityId,
    isOfficialApiSource: hint.isOfficialApiSource,
    fieldCompleteness: hint.fieldCompleteness,
    syncCount: (existingScore?.syncCount ?? 0) + 1,
    hasValidUrls: hint.hasValidUrls,
    linkedEntityCount,
  });

  const breakdown = {
    ...scored.details,
    normalizerHint: {
      missingFields: hint.missingFields,
      uncertainFields: hint.uncertainFields,
    },
  };

  const base = {
    entityType,
    entityId,
    overallScore: scored.overallScore,
    level: scored.level,
    sourceScore: scored.sourceScore,
    completenessScore: scored.completenessScore,
    confirmationScore: scored.confirmationScore,
    urlValidityScore: scored.urlValidityScore,
    linkageScore: scored.linkageScore,
    breakdown: breakdown as never,
    syncCount: scored.syncCount,
    lastScoredAt: new Date(),
  };

  const fk =
    entityType === "AD"
      ? { adId: fkId }
      : entityType === "STORE"
        ? { storeId: fkId }
        : entityType === "PRODUCT"
          ? { productId: fkId }
          : entityType === "COLLECTION"
            ? { collectionId: fkId }
            : { landingPageId: fkId };

  await prisma.confidenceScore.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { ...base, ...fk },
    update: {
      overallScore: base.overallScore,
      level: base.level,
      completenessScore: base.completenessScore,
      confirmationScore: base.confirmationScore,
      urlValidityScore: base.urlValidityScore,
      linkageScore: base.linkageScore,
      breakdown: base.breakdown,
      syncCount: base.syncCount,
      lastScoredAt: base.lastScoredAt,
    },
  });
}
