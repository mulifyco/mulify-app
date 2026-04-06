/**
 * Meta Ads source adapter — orchestrates client + rate limit + raw envelopes.
 */

import type { SourceAdapter, SourceFetchBatchParams } from "@/lib/sources/shared/contracts";
import type {
  AdapterCapabilities,
  AdapterFetchBatchResult,
  AdapterRuntimeConfigBase,
  IngestionContext,
  NormalizationOutcome,
  RawPayloadRecord,
} from "@/lib/sources/shared/types";
import type { MetaAdRawPayload } from "@/types";
import { HttpError } from "@/lib/http";
import { logger } from "@/lib/logger";
import { withIngestionRetry } from "@/lib/sources/shared/retry";
import { resolveMetaConfig, type MetaResolvedConfig } from "./config";
import { MOCK_META_ADS } from "./mock-data";
import { metaMapToNormalizationOutcome } from "./mapper";

export const META_ADS_CAPABILITIES: AdapterCapabilities = {
  supportsPagination: true,
  supportsResume: true,
  supportsIncrementalSync: false,
  maxPageSize: 100,
  rateLimitDescription:
    "Graph API Ad Library: per-token hourly budget; x-app-usage header reflects % consumed.",
  knownLimitations: [
    "Destination / final landing URLs are generally not available from ads_archive.",
    "Creative image/video CDN URLs are not returned; snapshot URL is Meta-hosted.",
    "Spend, impressions, delivery_by_region often appear only for political/issue ads.",
    "Only one search_terms value per HTTP request; multiple terms require separate runs or future cursor support.",
  ],
};

export class MetaAdsSourceAdapter implements SourceAdapter<MetaResolvedConfig, MetaAdRawPayload> {
  readonly capabilities = META_ADS_CAPABILITIES;

  async resolveConfig(base: AdapterRuntimeConfigBase): Promise<MetaResolvedConfig> {
    return resolveMetaConfig(base);
  }

  async fetchBatch(
    params: SourceFetchBatchParams,
    config: MetaResolvedConfig
  ): Promise<AdapterFetchBatchResult<MetaAdRawPayload>> {
    if (config.mockMode) {
      const fetchedAt = new Date().toISOString();
      const ads = MOCK_META_ADS.map((ad) => ({ ...ad, _fetchedAt: fetchedAt }));
      const records: RawPayloadRecord<MetaAdRawPayload>[] = ads.map((ad) => ({
        externalId: ad.id,
        entityType: "AD",
        payload: ad,
        ingestionTimestamp: fetchedAt,
        sourceMetadata: { mock: true },
      }));
      return {
        records,
        hasMore: false,
        totalFetched: records.length,
        transportMetadata: { mock: true },
      };
    }

    const after = params.jobCursor?.trim() || undefined;
    const limit = params.limit ?? config.defaultLimit;

    await config.rateLimiter.throttle();

    let page;
    try {
      page = await withIngestionRetry(
        () =>
          config.client.fetchPage({
            accessToken: config.accessToken,
            apiVersion: config.apiVersion,
            baseUrl: config.baseUrl,
            adReachedCountries: config.adReachedCountries,
            searchTerms: config.searchTerm,
            pageIds: config.pageIds,
            adActiveStatus: config.adActiveStatus,
            adType: config.adType,
            limit,
            after,
          }),
        { label: "meta-ads_archive", retryRateLimit: true }
      );
    } catch (err) {
      if (err instanceof HttpError && err.isRateLimit) {
        throw new Error("RATE_LIMITED");
      }
      throw err;
    }

    if (page.apiUsage && page.apiUsage.callCount > 80) {
      logger.warn("[meta-adapter] Approaching hourly usage budget", {
        apiUsage: page.apiUsage,
        jobId: params.ctx.jobId,
      });
    }

    const records: RawPayloadRecord<MetaAdRawPayload>[] = page.ads.map((ad) => ({
      externalId: ad.id,
      entityType: "AD",
      payload: ad,
      ingestionTimestamp: page.fetchedAt,
      sourceMetadata: {
        apiUsage: page.apiUsage,
        searchMode: config.searchTerm ? "search_terms" : "search_page_ids",
      },
    }));

    const nextCursor = page.nextCursor;

    return {
      records,
      nextCursor,
      hasMore: page.hasMore,
      totalFetched: records.length,
      transportMetadata: page.apiUsage ? { metaApiUsage: page.apiUsage } : undefined,
    };
  }

  normalize(
    _ctx: IngestionContext,
    record: RawPayloadRecord<MetaAdRawPayload>,
    rawRecordId: string
  ): NormalizationOutcome {
    return metaMapToNormalizationOutcome(record.payload, rawRecordId);
  }
}
