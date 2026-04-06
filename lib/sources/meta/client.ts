/**
 * Meta Ad Library HTTP client (Graph `ads_archive`).
 * Rate limiting is enforced by the caller; this class reads x-app-usage when present.
 */

import { fetchJson, HttpError, sleep } from "@/lib/http";
import { logger } from "@/lib/logger";
import type { MetaAdRawPayload } from "@/types";

export interface MetaApiUsage {
  callCount: number;
  totalCputime: number;
  totalTime: number;
}

export interface MetaFetchPageParams {
  accessToken: string;
  apiVersion: string;
  baseUrl?: string;
  adReachedCountries: string[];
  searchTerms?: string;
  pageIds?: string[];
  adActiveStatus?: "ACTIVE" | "INACTIVE" | "ALL";
  adType?: "POLITICAL_AND_ISSUE_ADS" | "ALL";
  limit?: number;
  after?: string;
}

export interface MetaFetchPageResult {
  ads: MetaAdRawPayload[];
  nextCursor: string | undefined;
  hasMore: boolean;
  apiUsage: MetaApiUsage | undefined;
  fetchedAt: string;
}

const AD_LIBRARY_FIELDS = [
  "id",
  "page_id",
  "page_name",
  "ad_creative_bodies",
  "ad_creative_link_captions",
  "ad_creative_link_descriptions",
  "ad_creative_link_titles",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "currency",
  "impressions",
  "spend",
  "publisher_platforms",
  "languages",
  "delivery_by_region",
  "bylines",
].join(",");

export class MetaAdLibraryClient {
  private readonly baseUrl: string;

  constructor(
    private readonly accessToken: string,
    private readonly apiVersion: string,
    baseUrl = "https://graph.facebook.com"
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async fetchPage(params: MetaFetchPageParams): Promise<MetaFetchPageResult> {
    const url = this.buildUrl(params);
    const fetchedAt = new Date().toISOString();

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      try {
        response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mulify-Library/1.0",
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Meta API fetch failed: ${message}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new HttpError(response.status, response.statusText, url, body);
    }

    const apiUsage = parseApiUsageHeader(response.headers.get("x-app-usage"));

    if (apiUsage && apiUsage.callCount >= 95) {
      logger.warn("[meta-client] API usage critically high — pausing 60s", {
        callCount: apiUsage.callCount,
      });
      await sleep(60_000);
    }

    const body = (await response.json()) as MetaAdLibraryPageResponse;

    return {
      ads: (body.data ?? []).map((ad) => ({ ...ad, _fetchedAt: fetchedAt })),
      nextCursor: body.paging?.cursors?.after,
      hasMore: Boolean(body.paging?.next),
      apiUsage,
      fetchedAt,
    };
  }

  async validateToken(): Promise<true> {
    const url = `${this.baseUrl}/${this.apiVersion}/me?access_token=${this.accessToken}&fields=id,name`;
    try {
      await fetchJson(url, { timeoutMs: 10_000 });
      return true;
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status === 401 || err.status === 403) {
          throw new Error(
            `Meta access token is invalid or lacks required permissions (HTTP ${err.status}). ` +
              "Ensure ads_library permission and Ad Library API app review where required."
          );
        }
      }
      throw err;
    }
  }

  private buildUrl(params: MetaFetchPageParams): string {
    const q = new URLSearchParams({
      access_token: params.accessToken,
      ad_reached_countries: JSON.stringify(params.adReachedCountries),
      ad_active_status: params.adActiveStatus ?? "ALL",
      ad_type: params.adType ?? "ALL",
      fields: AD_LIBRARY_FIELDS,
      limit: String(Math.min(params.limit ?? 50, 100)),
    });

    if (params.searchTerms) {
      q.set("search_terms", params.searchTerms);
    } else if (params.pageIds?.length) {
      q.set("search_page_ids", params.pageIds.join(","));
    } else {
      throw new Error(
        "MetaAdLibraryClient.fetchPage: either searchTerms or pageIds must be provided"
      );
    }

    if (params.after) {
      q.set("after", params.after);
    }

    const version = params.apiVersion ?? this.apiVersion;
    const base = params.baseUrl?.replace(/\/$/, "") ?? this.baseUrl;

    return `${base}/${version}/ads_archive?${q.toString()}`;
  }
}

interface MetaAdLibraryPageResponse {
  data?: MetaAdRawPayload[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
  error?: { message: string; type: string; code: number };
}

function parseApiUsageHeader(header: string | null): MetaApiUsage | undefined {
  if (!header) return undefined;
  try {
    const raw = JSON.parse(header) as Record<string, number>;
    return {
      callCount: raw["call_count"] ?? 0,
      totalCputime: raw["total_cputime"] ?? 0,
      totalTime: raw["total_time"] ?? 0,
    };
  } catch {
    return undefined;
  }
}
