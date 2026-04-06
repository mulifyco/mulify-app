import prisma from "@/lib/prisma";
import { MergeCandidateRepository } from "@/server/repositories/merge-candidate.repository";
import { urlFingerprint } from "@/server/intelligence/url-normalize";

export interface MergeSweepResult {
  upserted: number;
}

export async function runMergeCandidateSweep(options: { maxPairsPerKind?: number } = {}): Promise<MergeSweepResult> {
  const cap = options.maxPairsPerKind ?? 120;
  let upserted = 0;

  const adGroups = await prisma.ad.groupBy({
    by: ["canonicalUrl"],
    where: { NOT: { canonicalUrl: null } },
    _count: { _all: true },
  });
  const dupAdUrls = adGroups
    .filter((g) => g.canonicalUrl && g._count._all > 1)
    .slice(0, cap);

  for (const g of dupAdUrls) {
    if (!g.canonicalUrl) continue;
    const ads = await prisma.ad.findMany({
      where: { canonicalUrl: g.canonicalUrl },
      select: { id: true },
      take: 30,
    });
    for (let i = 0; i < ads.length; i++) {
      for (let j = i + 1; j < ads.length; j++) {
        await MergeCandidateRepository.upsertCandidate({
          entityType: "AD",
          entityIdA: ads[i].id,
          entityIdB: ads[j].id,
          level: "EXACT",
          confidence: 0.95,
          mergeReason: "identical_canonical_url",
          supportingEntityIds: [g.canonicalUrl],
        });
        upserted++;
      }
    }
  }

  const prodDup = await prisma.product.groupBy({
    by: ["storeId", "handle"],
    _count: { _all: true },
  });
  const dupHandles = prodDup.filter((r) => r._count._all > 1).slice(0, cap);
  for (const d of dupHandles) {
    const rows = await prisma.product.findMany({
      where: { storeId: d.storeId, handle: d.handle },
      select: { id: true, title: true, featuredImage: true, externalId: true },
      take: 20,
    });
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const conflicting =
          rows[i].externalId &&
          rows[j].externalId &&
          rows[i].externalId !== rows[j].externalId
            ? { externalId: [rows[i].externalId, rows[j].externalId] }
            : null;
        await MergeCandidateRepository.upsertCandidate({
          entityType: "PRODUCT",
          entityIdA: rows[i].id,
          entityIdB: rows[j].id,
          level: conflicting ? "CONFLICT" : "EXACT",
          confidence: conflicting ? 0.55 : 0.9,
          mergeReason: conflicting
            ? "duplicate_handle_same_store_external_id_mismatch"
            : "duplicate_handle_same_store",
          supportingEntityIds: [d.storeId, d.handle],
          conflictingFields: conflicting,
        });
        upserted++;
      }
    }
  }

  const productsForTitle = await prisma.product.findMany({
    where: {
      featuredImage: { not: null },
    },
    select: {
      id: true,
      storeId: true,
      title: true,
      featuredImage: true,
    },
    take: 800,
  });
  const titleMap = new Map<string, typeof productsForTitle>();
  for (const p of productsForTitle) {
    const key = `${p.storeId}\u0000${p.title.toLowerCase().trim()}\u0000${p.featuredImage}`;
    const arr = titleMap.get(key) ?? [];
    arr.push(p);
    titleMap.set(key, arr);
  }
  for (const [, arr] of titleMap) {
    if (arr.length < 2) continue;
    if (upserted > cap * 20) break;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (arr[i].id === arr[j].id) continue;
        await MergeCandidateRepository.upsertCandidate({
          entityType: "PRODUCT",
          entityIdA: arr[i].id,
          entityIdB: arr[j].id,
          level: "PROBABLE",
          confidence: 0.72,
          mergeReason: "same_title_image_store",
          supportingEntityIds: [arr[i].storeId],
        });
        upserted++;
      }
    }
  }

  const lps = await prisma.landingPage.findMany({
    select: { id: true, url: true },
    take: 1500,
  });
  const fpMap = new Map<string, string[]>();
  for (const lp of lps) {
    const fp = urlFingerprint(lp.url);
    if (!fp) continue;
    const list = fpMap.get(fp) ?? [];
    list.push(lp.id);
    fpMap.set(fp, list);
  }
  for (const [, ids] of fpMap) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        await MergeCandidateRepository.upsertCandidate({
          entityType: "LANDING_PAGE",
          entityIdA: ids[i],
          entityIdB: ids[j],
          level: "PROBABLE",
          confidence: 0.68,
          mergeReason: "normalized_url_fingerprint_match",
          supportingEntityIds: ids,
        });
        upserted++;
      }
    }
  }

  return { upserted };
}
