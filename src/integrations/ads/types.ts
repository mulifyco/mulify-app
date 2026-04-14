import type { CreativeType, Platform } from "@prisma/client";

export interface ExternalShopRecord {
  domain: string;
  name: string;
  platform: Platform;
  originCountry?: string;
  language?: string;
  currency?: string;
  monthlyVisits?: number;
  estimatedDailyRevenue?: number;
  activeMetaAds?: number;
  lastSeenAt?: Date;
}

export interface ExternalAdRecord {
  shopDomain: string;
  adLibraryId?: string;
  platform: Platform;
  creativeType: CreativeType;
  adText?: string;
  creativeUrl?: string;
  thumbnailUrl?: string;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  isActive?: boolean;
  impressionsEstimate?: number;
  adCount?: number;
}

export interface ExternalAdsBatch {
  fetchedAt: Date;
  shops: ExternalShopRecord[];
  ads: ExternalAdRecord[];
  metadata?: Record<string, unknown>;
}

export type ExternalAdsBatchResult = {
  batch: ExternalAdsBatch;
  /** Human-readable provenance for logs. */
  provider: string;
};

export interface AdsProvider {
  readonly name: string;
  fetchLatestAds(params?: { limitAds?: number; limitShops?: number }): Promise<ExternalAdsBatchResult>;
}

