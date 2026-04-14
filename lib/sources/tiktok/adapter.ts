/**
 * TikTok profile → raw records (videos as AD rows, outbound URLs as LANDING_PAGE stubs).
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
import {
  fetchTikTokPageSnapshot,
  hashLandingExternalId,
  TIKTOK_PLATFORM,
} from "@/src/integrations/tiktok/providers/httpTikTokProvider";
import { withIngestionRetry } from "@/lib/sources/shared/retry";
import { resolveTikTokPageConfig, type TikTokResolvedConfig } from "./config";
import type { TikTokPageRawLandingPayload, TikTokPageRawVideoPayload } from "./types";
import { tiktokNormalizeRecord } from "./mapper";

export const TIKTOK_PAGE_CAPABILITIES: AdapterCapabilities = {
  supportsPagination: false,
  supportsResume: false,
  supportsIncrementalSync: false,
  maxPageSize: 80,
  rateLimitDescription: "Public HTML fetch — best-effort; no official API token.",
  knownLimitations: [
    "TikTok may block or throttle server-side HTML fetches; videos/links can be empty without throwing.",
    "Captions and outbound URLs depend on embedded JSON in the page.",
  ],
};

export class TikTokPageSourceAdapter implements SourceAdapter<TikTokResolvedConfig, unknown> {
  readonly capabilities = TIKTOK_PAGE_CAPABILITIES;

  async resolveConfig(base: AdapterRuntimeConfigBase): Promise<TikTokResolvedConfig> {
    return resolveTikTokPageConfig(base);
  }

  async fetchBatch(
    params: SourceFetchBatchParams,
    config: TikTokResolvedConfig
  ): Promise<AdapterFetchBatchResult<unknown>> {
    const fetchedAt = new Date().toISOString();

    const snapshot = await withIngestionRetry(
      () =>
        fetchTikTokPageSnapshot({
          pageUrl: config.profileUrl,
          handle: config.handle,
          timeoutMs: config.timeoutMs,
        }),
      { label: "tiktok-page-snapshot", retryRateLimit: true }
    );

    const records: RawPayloadRecord<unknown>[] = [];
    const bioLinks = snapshot.outboundLinks;

    for (const v of snapshot.videos) {
      const payload: TikTokPageRawVideoPayload = {
        platform: TIKTOK_PLATFORM,
        videoId: v.videoId,
        handle: snapshot.profileHandle,
        profileUrl: snapshot.profileUrl,
        creativeUrl: v.creativeUrl,
        thumbnailUrl: v.thumbnailUrl ?? null,
        caption: v.caption ?? null,
        outboundUrl: v.outboundUrl ?? null,
        bioLinks,
        hookPhrase: v.hookPhrase ?? null,
        hashtags: v.hashtags ?? [],
        musicId: v.musicId ?? null,
        musicTitle: v.musicTitle ?? null,
        fetchedAt,
      };
      records.push({
        externalId: `tiktok:video:${v.videoId}`,
        entityType: "AD",
        payload,
        ingestionTimestamp: fetchedAt,
        sourceMetadata: { platform: TIKTOK_PLATFORM },
      });
    }

    const landingSeen = new Set<string>();
    for (const href of snapshot.outboundLinks) {
      const t = href.trim();
      if (!t.startsWith("http")) continue;
      try {
        const u = new URL(t);
        const host = u.hostname.toLowerCase();
        if (host === "tiktok.com" || host.endsWith(".tiktok.com")) continue;
      } catch {
        continue;
      }
      const canonical = t.split("#")[0] ?? t;
      if (landingSeen.has(canonical)) continue;
      landingSeen.add(canonical);

      const lpPayload: TikTokPageRawLandingPayload = {
        kind: "tiktok_outbound",
        url: canonical,
        fetchedAt,
      };
      records.push({
        externalId: `tiktok:lp:${hashLandingExternalId(canonical)}`,
        entityType: "LANDING_PAGE",
        payload: lpPayload,
        ingestionTimestamp: fetchedAt,
        sourceMetadata: { platform: TIKTOK_PLATFORM },
      });
    }

    return {
      records,
      hasMore: false,
      totalFetched: records.length,
      transportMetadata: {
        tiktok: true,
        videosFetched: snapshot.metrics.videosFetched,
        outboundLinksFound: snapshot.metrics.outboundLinksFound,
        landingPageRecords: landingSeen.size,
        profileUrl: snapshot.profileUrl,
      },
    };
  }

  normalize(
    _ctx: IngestionContext,
    record: RawPayloadRecord<unknown>,
    rawRecordId: string
  ): NormalizationOutcome {
    return tiktokNormalizeRecord(
      { entityType: record.entityType, payload: record.payload },
      rawRecordId
    );
  }
}
