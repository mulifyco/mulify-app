import prisma from "@/lib/prisma";
import { normalizeUrl } from "@/lib/url";
import { landingPageFieldsFromNormalizedUrl } from "@/server/intelligence/url-normalize";
import { InferredLinkRepository } from "@/server/repositories/inferred-link.repository";

export interface LinkingPassResult {
  inferredUpserts: number;
  adsConnectedToLp: number;
  entityLinksStrengthened: number;
}

async function strengthenAdEntityLinks(adId: string): Promise<number> {
  const links = await prisma.entityLink.findMany({
    where: { adId },
    select: { id: true, linkStrength: true },
  });
  let n = 0;
  for (const l of links) {
    const next = Math.min(1, (l.linkStrength ?? 0.85) + 0.04);
    await prisma.entityLink.update({
      where: { id: l.id },
      data: {
        linkStrength: next,
        linkProvenance: "ingestion_reconfirmed",
        lastConfirmedAt: new Date(),
        staleAt: null,
      },
    });
    n++;
  }
  return n;
}

/**
 * Deterministic inference: ad URLs → landing page rows → store by domain;
 * product ↔ collection from membership; optional store → product edges (catalog depth).
 */
export async function runLinkingPass(options: {
  maxAds?: number;
  maxCollectionProducts?: number;
  storeProductLinkSample?: number;
} = {}): Promise<LinkingPassResult> {
  const maxAds = options.maxAds ?? 600;
  const maxCollectionProducts = options.maxCollectionProducts ?? 4000;
  const storeProductSample = options.storeProductLinkSample ?? 2000;

  let inferredUpserts = 0;
  let adsConnectedToLp = 0;
  let entityLinksStrengthened = 0;

  const ads = await prisma.ad.findMany({
    where: {
      OR: [{ destinationUrl: { not: null } }, { canonicalUrl: { not: null } }],
    },
    select: { id: true, destinationUrl: true, canonicalUrl: true },
    orderBy: { lastSeenAt: "desc" },
    take: maxAds,
  });

  for (const ad of ads) {
    const raw = ad.canonicalUrl || ad.destinationUrl;
    if (!raw) continue;
    const norm = normalizeUrl(raw);
    if (!norm) continue;
    const fields = landingPageFieldsFromNormalizedUrl(norm);
    if (!fields) continue;

    const lp = await prisma.landingPage.upsert({
      where: { url: fields.url },
      create: {
        url: fields.url,
        domain: fields.domain,
        path: fields.path,
      },
      update: { lastSeenAt: new Date(), domain: fields.domain, path: fields.path },
    });

    const already = await prisma.ad.findUnique({
      where: { id: ad.id },
      select: { landingPages: { where: { id: lp.id }, select: { id: true } } },
    });
    if (!already?.landingPages.length) {
      await prisma.ad.update({
        where: { id: ad.id },
        data: { landingPages: { connect: { id: lp.id } } },
      });
      adsConnectedToLp++;
    }

    const canonicalMatches =
      Boolean(ad.canonicalUrl && normalizeUrl(ad.canonicalUrl) === norm);

    await InferredLinkRepository.upsertConfirm({
      fromEntityType: "AD",
      fromEntityId: ad.id,
      toEntityType: "LANDING_PAGE",
      toEntityId: lp.id,
      strength: canonicalMatches ? 0.94 : 0.78,
      sourceReason: canonicalMatches ? "canonical_url_equality" : "destination_url_normalized",
      metadata: { normalizedUrl: norm },
    });
    inferredUpserts++;

    const store = await prisma.store.findUnique({ where: { domain: lp.domain } });
    if (store) {
      await InferredLinkRepository.upsertConfirm({
        fromEntityType: "LANDING_PAGE",
        fromEntityId: lp.id,
        toEntityType: "STORE",
        toEntityId: store.id,
        strength: 0.9,
        sourceReason: "landing_domain_matches_store",
        metadata: { domain: lp.domain },
      });
      inferredUpserts++;

      await InferredLinkRepository.upsertConfirm({
        fromEntityType: "AD",
        fromEntityId: ad.id,
        toEntityType: "STORE",
        toEntityId: store.id,
        strength: 0.72,
        sourceReason: "ad_resolves_to_store_via_landing_domain",
        metadata: { landingPageId: lp.id },
      });
      inferredUpserts++;
    }

    entityLinksStrengthened += await strengthenAdEntityLinks(ad.id);
  }

  const memberships = await prisma.collectionProduct.findMany({
    select: { productId: true, collectionId: true },
    take: maxCollectionProducts,
  });
  for (const m of memberships) {
    await InferredLinkRepository.upsertConfirm({
      fromEntityType: "PRODUCT",
      fromEntityId: m.productId,
      toEntityType: "COLLECTION",
      toEntityId: m.collectionId,
      strength: 0.88,
      sourceReason: "collection_membership",
    });
    inferredUpserts++;
  }

  const products = await prisma.product.findMany({
    select: { id: true, storeId: true },
    orderBy: { lastSeenAt: "desc" },
    take: storeProductSample,
  });
  for (const p of products) {
    await InferredLinkRepository.upsertConfirm({
      fromEntityType: "STORE",
      fromEntityId: p.storeId,
      toEntityType: "PRODUCT",
      toEntityId: p.id,
      strength: 0.55,
      sourceReason: "store_catalog_edge",
    });
    inferredUpserts++;
  }

  return { inferredUpserts, adsConnectedToLp, entityLinksStrengthened };
}
