/**
 * Shopify storefront sync: upsert LandingPage rows + EntityLink + InferredLink graph edges.
 * Idempotent on LP url and InferredLink keys; EntityLink is per-raw-record lineage.
 */

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { buildShopifyCollectionUrl, buildShopifyProductUrl, normalizeShopifyLandingPagePublicUrl } from "@/lib/url";
import { landingPageFieldsFromNormalizedUrl } from "@/server/intelligence/url-normalize";
import { InferredLinkRepository } from "@/server/repositories/inferred-link.repository";

const META = { shopifyGraph: true, source: "shopify_storefront_sync" as const };

async function upsertLandingPageRow(canonicalUrl: string): Promise<{ id: string; domain: string } | null> {
  const fields = landingPageFieldsFromNormalizedUrl(canonicalUrl);
  if (!fields) return null;
  const now = new Date();
  const lp = await prisma.landingPage.upsert({
    where: { url: fields.url },
    create: {
      url: fields.url,
      domain: fields.domain,
      path: fields.path,
      hasShopifySignal: true,
      lastSeenAt: now,
      metadata: META as never,
    },
    update: {
      domain: fields.domain,
      path: fields.path,
      lastSeenAt: now,
      hasShopifySignal: true,
    },
  });
  return { id: lp.id, domain: lp.domain };
}

async function upsertEntityLinkToLp(params: {
  rawRecordId: string;
  storeId: string;
  landingPageId: string;
  productId?: string;
  collectionId?: string;
}): Promise<void> {
  const now = new Date();
  await prisma.entityLink.upsert({
    where: {
      rawRecordId_entityType_entityId: {
        rawRecordId: params.rawRecordId,
        entityType: "LANDING_PAGE",
        entityId: params.landingPageId,
      },
    },
    create: {
      rawRecordId: params.rawRecordId,
      entityType: "LANDING_PAGE",
      entityId: params.landingPageId,
      landingPageId: params.landingPageId,
      storeId: params.storeId,
      productId: params.productId,
      collectionId: params.collectionId,
      linkProvenance: "shopify_storefront",
      linkStrength: 1,
      firstConfirmedAt: now,
      lastConfirmedAt: now,
    },
    update: {
      storeId: params.storeId,
      productId: params.productId ?? null,
      collectionId: params.collectionId ?? null,
      linkProvenance: "shopify_storefront_reconfirmed",
      lastConfirmedAt: now,
      staleAt: null,
      linkStrength: 1,
    },
  });
}

async function upsertInferredStoreLpEdges(storeId: string, storeDomain: string, lpId: string, lpDomain: string): Promise<void> {
  await InferredLinkRepository.upsertConfirm({
    fromEntityType: "STORE",
    fromEntityId: storeId,
    toEntityType: "LANDING_PAGE",
    toEntityId: lpId,
    strength: 0.96,
    sourceReason: "shopify_storefront_homepage",
    metadata: { storeDomain },
  });
  if (lpDomain === storeDomain) {
    await InferredLinkRepository.upsertConfirm({
      fromEntityType: "LANDING_PAGE",
      fromEntityId: lpId,
      toEntityType: "STORE",
      toEntityId: storeId,
      strength: 0.96,
      sourceReason: "landing_domain_matches_store",
      metadata: { domain: lpDomain },
    });
  }
}

/** Homepage LP: https://{domain}/ */
export async function syncShopifyLandingGraphFromStore(params: {
  rawRecordId: string;
  storeId: string;
  storeDomain: string;
}): Promise<void> {
  const { rawRecordId, storeId, storeDomain } = params;
  const homeUrl = normalizeShopifyLandingPagePublicUrl(`https://${storeDomain}/`);
  if (!homeUrl) {
    logger.warn("shopify.lp_graph.store_skip_normalize", { storeDomain });
    return;
  }
  const lpRow = await upsertLandingPageRow(homeUrl);
  if (!lpRow) return;
  await upsertEntityLinkToLp({ rawRecordId, storeId, landingPageId: lpRow.id });
  await upsertInferredStoreLpEdges(storeId, storeDomain, lpRow.id, lpRow.domain);
}

export async function syncShopifyLandingGraphFromProduct(params: {
  rawRecordId: string;
  storeId: string;
  storeDomain: string;
  productId: string;
  productUrl: string;
  productHandle: string;
}): Promise<void> {
  const { rawRecordId, storeId, storeDomain, productId, productUrl, productHandle } = params;
  const primary =
    normalizeShopifyLandingPagePublicUrl(productUrl) ??
    normalizeShopifyLandingPagePublicUrl(buildShopifyProductUrl(storeDomain, productHandle));
  if (!primary) {
    logger.warn("shopify.lp_graph.product_skip_normalize", { productId, productUrl });
    return;
  }
  const lpRow = await upsertLandingPageRow(primary);
  if (!lpRow) return;
  await upsertEntityLinkToLp({ rawRecordId, storeId, landingPageId: lpRow.id, productId });
  await InferredLinkRepository.upsertConfirm({
    fromEntityType: "PRODUCT",
    fromEntityId: productId,
    toEntityType: "LANDING_PAGE",
    toEntityId: lpRow.id,
    strength: 0.97,
    sourceReason: "shopify_product_canonical_url",
    metadata: { handle: productHandle },
  });
  if (lpRow.domain === storeDomain) {
    await InferredLinkRepository.upsertConfirm({
      fromEntityType: "LANDING_PAGE",
      fromEntityId: lpRow.id,
      toEntityType: "STORE",
      toEntityId: storeId,
      strength: 0.94,
      sourceReason: "pdp_domain_matches_store",
      metadata: { productId },
    });
  }
}

export async function syncShopifyLandingGraphFromCollection(params: {
  rawRecordId: string;
  storeId: string;
  storeDomain: string;
  collectionId: string;
  collectionUrl: string;
  collectionHandle: string;
}): Promise<void> {
  const { rawRecordId, storeId, storeDomain, collectionId, collectionUrl, collectionHandle } = params;
  const primary =
    normalizeShopifyLandingPagePublicUrl(collectionUrl) ??
    normalizeShopifyLandingPagePublicUrl(buildShopifyCollectionUrl(storeDomain, collectionHandle));
  if (!primary) {
    logger.warn("shopify.lp_graph.collection_skip_normalize", { collectionId, collectionUrl });
    return;
  }
  const lpRow = await upsertLandingPageRow(primary);
  if (!lpRow) return;
  await upsertEntityLinkToLp({ rawRecordId, storeId, landingPageId: lpRow.id, collectionId });
  await InferredLinkRepository.upsertConfirm({
    fromEntityType: "COLLECTION",
    fromEntityId: collectionId,
    toEntityType: "LANDING_PAGE",
    toEntityId: lpRow.id,
    strength: 0.97,
    sourceReason: "shopify_collection_canonical_url",
    metadata: { handle: collectionHandle },
  });
  if (lpRow.domain === storeDomain) {
    await InferredLinkRepository.upsertConfirm({
      fromEntityType: "LANDING_PAGE",
      fromEntityId: lpRow.id,
      toEntityType: "STORE",
      toEntityId: storeId,
      strength: 0.94,
      sourceReason: "collection_lp_domain_matches_store",
      metadata: { collectionId },
    });
  }
}
