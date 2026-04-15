import type { Platform } from "@prisma/client";
import prisma from "@/src/lib/prisma";
import { createHash } from "crypto";
import { computeCreativeWinnerScore } from "@/lib/intelligence/creative-winner";
import { creativeMediaFingerprintKey } from "@/lib/intelligence/creative-fingerprint";
import { openReviewQueueItem } from "@/server/services/review-queue.service";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function hash16(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function textKey(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 12) return null;
  return s.slice(0, 120);
}

type AdScanRow = {
  id: string;
  platform: string;
  creativeUrl: string | null;
  thumbnailUrl: string | null;
  adImageUrl: string | null;
  adVideoUrl: string | null;
  adText: string | null;
  adTitle: string | null;
  shopId: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

async function upsertCluster(params: {
  fingerprint: string;
  platform: string;
  confidence: number;
  adIds: string[];
  shopIdsByAdId: Map<string, string | null>;
}) {
  const now = new Date();
  const existing = await creativeClusterDb().findUnique({
    where: { fingerprint: params.fingerprint },
    select: { id: true },
  });

  const cluster = (await creativeClusterDb().upsert({
    where: { fingerprint: params.fingerprint },
    create: {
      fingerprint: params.fingerprint,
      platform: params.platform as Platform,
      confidence: params.confidence,
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: { version: 2, createdBy: "refresh_creative_clusters" } as never,
    },
    update: {
      platform: params.platform as Platform,
      confidence: params.confidence,
      lastSeenAt: now,
      metadata: { version: 2, updatedBy: "refresh_creative_clusters" } as never,
    },
    select: { id: true },
  })) as { id: string };

  for (const adId of params.adIds) {
    await prisma.creativeClusterMember.upsert({
      where: { adId },
      create: {
        adId,
        clusterId: cluster.id,
        shopId: params.shopIdsByAdId.get(adId) ?? null,
      },
      update: {
        clusterId: cluster.id,
        shopId: params.shopIdsByAdId.get(adId) ?? null,
      },
    });
  }

  const members = await prisma.creativeClusterMember.findMany({
    where: { clusterId: cluster.id },
    select: {
      shopId: true,
      ad: { select: { firstSeenAt: true, lastSeenAt: true } },
    },
    take: 1200,
  });

  const shopIds = new Set<string>();
  let firstSeenAt = now;
  let lastSeenAt = new Date(0);
  for (const m of members) {
    if (m.shopId) shopIds.add(m.shopId);
    if (m.ad.firstSeenAt < firstSeenAt) firstSeenAt = m.ad.firstSeenAt;
    if (m.ad.lastSeenAt > lastSeenAt) lastSeenAt = m.ad.lastSeenAt;
  }

  const creativeCount = members.length;
  const storeCount = shopIds.size;

  // Product cluster count: approximate via Store domain → ProductClusterMember storeId.
  // We keep this best-effort and capped to avoid heavy joins.
  const shopDomains = storeCount
    ? await prisma.shop.findMany({
        where: { id: { in: [...shopIds].slice(0, 50) } },
        select: { domain: true },
      })
    : [];
  const storeIds = shopDomains.length
    ? await prisma.store.findMany({
        where: { domain: { in: shopDomains.map((s) => s.domain) } },
        select: { id: true },
        take: 80,
      })
    : [];
  const productClusterCount = storeIds.length
    ? await prisma.productClusterMember
        .findMany({
          where: { storeId: { in: storeIds.map((s) => s.id) } },
          select: { clusterId: true },
          take: 800,
        })
        .then((rows) => new Set(rows.map((r) => r.clusterId)).size)
        .catch(() => 0)
    : 0;

  const saturationScore = clampInt((creativeCount / 30) * 100, 0, 100);
  const scaleScore = clampInt(storeCount * 12 + Math.min(creativeCount, 30) * 1.2 + productClusterCount * 6, 0, 100);

  const refinedConfidence = Math.min(
    0.96,
    Math.max(
      0.35,
      params.confidence + Math.min(0.05, creativeCount * 0.004) - (storeCount >= 12 ? 0.05 : 0)
    )
  );

  const creativeWinnerScore = computeCreativeWinnerScore({
    scaleScore,
    saturationScore,
    creativeCount,
    storeCount,
    productClusterCount,
    firstSeenAt,
    lastSeenAt,
    confidence: refinedConfidence,
  });

  await creativeClusterDb().update({
    where: { id: cluster.id },
    data: {
      creativeCount,
      storeCount,
      productClusterCount,
      firstSeenAt,
      lastSeenAt,
      saturationScore,
      scaleScore,
      creativeWinnerScore,
      confidence: refinedConfidence,
    },
  });

  return existing ? ("updated" as const) : ("created" as const);
}

export async function refreshCreativeClustersJob(): Promise<{
  adsScanned: number;
  clustersCreated: number;
  clustersUpdated: number;
  lowConfidenceSkipped: number;
}> {
  const scanLimit = Number.parseInt(process.env.CREATIVE_CLUSTER_SCAN_LIMIT ?? "700", 10) || 700;
  const maxClustersPerTick = Number.parseInt(process.env.CREATIVE_CLUSTER_MAX_CLUSTERS_PER_TICK ?? "160", 10) || 160;
  const minConfidence = Number.parseFloat(process.env.CREATIVE_CLUSTER_MIN_CONFIDENCE ?? "0.78") || 0.78;

  const ads = (await prisma.ad.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: scanLimit,
    select: {
      id: true,
      platform: true,
      creativeUrl: true,
      thumbnailUrl: true,
      adImageUrl: true,
      adVideoUrl: true,
      adText: true,
      adTitle: true,
      shopId: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  })) as unknown as AdScanRow[];

  const adsScanned = ads.length;
  let clustersCreated = 0;
  let clustersUpdated = 0;
  let lowConfidenceSkipped = 0;
  let reviewItemsOpened = 0;
  const reviewMax = Number.parseInt(process.env.REVIEW_QUEUE_MAX_PER_TICK ?? "12", 10) || 12;

  if (!ads.length) return { adsScanned: 0, clustersCreated: 0, clustersUpdated: 0, lowConfidenceSkipped: 0 };

  const shopIdsByAdId = new Map(ads.map((a) => [a.id, a.shopId]));

  // Group by strong media keys (no title-only merges).
  const groups = new Map<string, string[]>();
  const confidenceByFingerprint = new Map<string, number>();
  const platformByFingerprint = new Map<string, string>();

  for (const ad of ads) {
    const media =
      creativeMediaFingerprintKey(ad.adVideoUrl) ??
      creativeMediaFingerprintKey(ad.adImageUrl) ??
      creativeMediaFingerprintKey(ad.thumbnailUrl) ??
      creativeMediaFingerprintKey(ad.creativeUrl);
    if (!media) continue;

    const txt = textKey(ad.adText ?? ad.adTitle);
    const fpCore = `media:${hash16(media)}`;
    const fingerprint = `ccl_v1:${fpCore}`;

    // Confidence: video/image-first media key; text is helper-only.
    const confidence = ad.adVideoUrl || ad.adImageUrl ? (txt ? 0.88 : 0.84) : txt ? 0.85 : 0.8;
    confidenceByFingerprint.set(
      fingerprint,
      Math.max(confidenceByFingerprint.get(fingerprint) ?? 0, confidence)
    );
    platformByFingerprint.set(fingerprint, String(ad.platform ?? "UNKNOWN"));

    groups.set(fingerprint, [...(groups.get(fingerprint) ?? []), ad.id]);
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, maxClustersPerTick);

  for (const [fingerprint, adIds] of sorted) {
    const conf = confidenceByFingerprint.get(fingerprint) ?? 0.75;
    if (conf < minConfidence) {
      lowConfidenceSkipped += 1;
      if (reviewItemsOpened < reviewMax && adIds.length >= 4) {
        const sampleAdId = adIds[0] ?? null;
        await openReviewQueueItem({
          type: "LOW_CONFIDENCE_CREATIVE_CLUSTER",
          dedupeKey: `ccl_low:${fingerprint}`,
          priority: Math.min(95, 60 + Math.floor(adIds.length * 2) + Math.floor((minConfidence - conf) * 40)),
          title: `Low-confidence creative cluster (${adIds.length} creatives)`,
          reason: `Skipped cluster: confidence ${conf.toFixed(2)} < min ${minConfidence.toFixed(2)} · fp:${fingerprint}`.slice(
            0,
            420
          ),
          entityType: sampleAdId ? "AD" : null,
          entityId: sampleAdId,
          metadata: {
            fingerprint,
            platform: platformByFingerprint.get(fingerprint) ?? "UNKNOWN",
            confidence: conf,
            minConfidence,
            creativeCount: adIds.length,
            sampleAdIds: adIds.slice(0, 12),
          },
        }).catch(() => null);
        reviewItemsOpened += 1;
      }
      continue;
    }
    const platform = platformByFingerprint.get(fingerprint) ?? "UNKNOWN";
    const res = await upsertCluster({
      fingerprint,
      platform,
      confidence: conf,
      adIds,
      shopIdsByAdId,
    });
    if (res === "created") clustersCreated += 1;
    else clustersUpdated += 1;
  }

  return { adsScanned, clustersCreated, clustersUpdated, lowConfidenceSkipped };
}

