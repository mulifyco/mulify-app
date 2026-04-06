/**
 * Maps portable normalization output → Prisma upserts + entity links + confidence.
 * Adapters stay free of ORM code; this module is the single persistence bridge.
 */

import type { MappingResult } from "@/lib/sources/shared/types";
import prisma from "@/lib/prisma";
import { computeConfidence } from "@/lib/confidence";
import { logger } from "@/lib/logger";
import type { EntityType } from "@/types";
import {
  syncShopifyLandingGraphFromCollection,
  syncShopifyLandingGraphFromProduct,
  syncShopifyLandingGraphFromStore,
} from "@/lib/sources/persistence/shopify-landing-graph";

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
  const ad = await prisma.ad.upsert({
    where: { externalId: d.externalId },
    create: {
      externalId: d.externalId,
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
      pageName: d.pageName,
      adText: d.adText,
      adTitle: d.adTitle,
      adBody: d.adBody,
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

  await prisma.rawRecord.update({
    where: { id: rawRecordId },
    data: { status: "NORMALIZED", normalizedAt: new Date(), processingError: null },
  });

  await upsertConfidenceFromHint("AD", ad.id, ad.id, m, 0);
}

async function applyStore(m: MappingResult & { entity: { type: "STORE" } }, rawRecordId: string) {
  const d = m.entity.data;
  const store = await prisma.store.upsert({
    where: { domain: d.domain },
    create: {
      domain: d.domain,
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
      metadata: d.metadata as never,
      lastCrawledAt: new Date(),
    },
    update: {
      name: d.name ?? undefined,
      description: d.description ?? undefined,
      currency: d.currency ?? undefined,
      lastSeenAt: new Date(),
      lastCrawledAt: new Date(),
      metadata: d.metadata as never,
    },
  });

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
  const store = await prisma.store.upsert({
    where: { domain: d.storeDomain },
    create: { domain: d.storeDomain, platform: "shopify" },
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
  const store = await prisma.store.upsert({
    where: { domain: d.storeDomain },
    create: { domain: d.storeDomain, platform: "shopify" },
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
