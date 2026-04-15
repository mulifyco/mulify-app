import prisma from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";

type CreativeClusterWinnerQueryRow = {
  id: string;
  fingerprint: string;
  platform: Platform;
  creativeWinnerScore: number;
  scaleScore: number;
  saturationScore: number;
  creativeCount: number;
  storeCount: number;
  productClusterCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  confidence: number;
  members: Array<{
    adId: string | null;
    ad: {
      thumbnailUrl: string | null;
      adImageUrl: string | null;
      creativeUrl: string | null;
      adTitle: string | null;
      adText: string | null;
    } | null;
  }>;
};

export interface CreativeWinnersRow {
  clusterId: string;
  fingerprint: string;
  platform: Platform;
  creativeWinnerScore: number;
  scaleScore: number;
  saturationScore: number;
  creativeCount: number;
  storeCount: number;
  productClusterCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  confidence: number;
  previewUrl: string | null;
  previewLabel: string;
  sampleAdId: string | null;
}

export const CreativeWinnersBoardRepository = {
  async list(options: { take?: number; minScore?: number }): Promise<CreativeWinnersRow[]> {
    const take = Math.max(1, Math.min(5000, options.take ?? 30));
    const minScore = options.minScore ?? 0;

    const clusters = (await creativeClusterDb().findMany({
      where: { creativeWinnerScore: { gte: minScore } },
      orderBy: [{ creativeWinnerScore: "desc" }, { scaleScore: "desc" }, { lastSeenAt: "desc" }],
      take,
      select: {
        id: true,
        fingerprint: true,
        platform: true,
        creativeWinnerScore: true,
        scaleScore: true,
        saturationScore: true,
        creativeCount: true,
        storeCount: true,
        productClusterCount: true,
        firstSeenAt: true,
        lastSeenAt: true,
        confidence: true,
        members: {
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: {
            adId: true,
            ad: {
              select: {
                thumbnailUrl: true,
                adImageUrl: true,
                creativeUrl: true,
                adTitle: true,
                adText: true,
              },
            },
          },
        },
      },
    })) as CreativeClusterWinnerQueryRow[];

    return clusters.map((c) => {
      const m0 = c.members[0];
      const ad = m0?.ad;
      const previewUrl = ad?.thumbnailUrl ?? ad?.adImageUrl ?? ad?.creativeUrl ?? null;
      const previewLabel =
        (ad?.adTitle ?? ad?.adText ?? c.fingerprint).replace(/\s+/g, " ").trim().slice(0, 80) ||
        c.fingerprint.slice(0, 24);

      return {
        clusterId: c.id,
        fingerprint: c.fingerprint,
        platform: c.platform,
        creativeWinnerScore: c.creativeWinnerScore,
        scaleScore: c.scaleScore,
        saturationScore: c.saturationScore,
        creativeCount: c.creativeCount,
        storeCount: c.storeCount,
        productClusterCount: c.productClusterCount,
        firstSeenAt: c.firstSeenAt,
        lastSeenAt: c.lastSeenAt,
        confidence: c.confidence,
        previewUrl,
        previewLabel,
        sampleAdId: m0?.adId ?? null,
      };
    });
  },
};
