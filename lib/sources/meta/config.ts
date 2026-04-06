import { z } from "zod";
import type { AdapterRuntimeConfigBase } from "@/lib/sources/shared/types";
import { getMetaConfig, shouldMockMetaAdsApis } from "@/config";
import { RateLimiter } from "@/lib/http";
import { MetaAdLibraryClient } from "./client";

const sourceJsonSchema = z.object({
  searchTerms: z.array(z.string().min(1)).optional(),
  pageIds: z.array(z.string().min(1)).optional(),
  countries: z.array(z.string().min(2)).optional(),
  adActiveStatus: z.enum(["ACTIVE", "INACTIVE", "ALL"]).optional(),
  adType: z.enum(["POLITICAL_AND_ISSUE_ADS", "ALL"]).optional(),
});

export type MetaSourceConfigJson = z.infer<typeof sourceJsonSchema>;

export interface MetaResolvedConfig {
  accessToken: string;
  apiVersion: string;
  baseUrl: string;
  /** Ad Library requires reached countries — default US if omitted. */
  adReachedCountries: string[];
  /** Only the first term is used per HTTP request; rotate via separate runs or future cursor extension. */
  searchTerm?: string;
  pageIds?: string[];
  adActiveStatus: "ACTIVE" | "INACTIVE" | "ALL";
  adType: "POLITICAL_AND_ISSUE_ADS" | "ALL";
  defaultLimit: number;
  rateLimiter: RateLimiter;
  client: MetaAdLibraryClient;
  /** When set, fetchBatch returns fixtures — no Graph calls. */
  mockMode?: boolean;
}

export async function resolveMetaConfig(
  base: AdapterRuntimeConfigBase
): Promise<MetaResolvedConfig> {
  const env = getMetaConfig();
  const mockMode = shouldMockMetaAdsApis();

  if (!env.accessToken?.trim() && !mockMode) {
    throw new Error(
      "META_ACCESS_TOKEN is not set. Obtain a token from a Meta app with Ad Library API access, " +
        "or use development mode without a token / set LIBRARY_MOCK_SOURCE_APIS=true for fixtures."
    );
  }

  const parsed = sourceJsonSchema.safeParse(base.sourceConfigJson);
  if (!parsed.success) {
    throw new Error(`Invalid Meta source config JSON: ${parsed.error.message}`);
  }

  let j = parsed.data;
  let hasTerms = (j.searchTerms?.length ?? 0) > 0;
  let hasPages = (j.pageIds?.length ?? 0) > 0;
  if (!hasTerms && !hasPages && mockMode) {
    j = { ...j, searchTerms: ["library-local-mock"] };
    hasTerms = true;
  }
  if (!hasTerms && !hasPages) {
    throw new Error(
      "Meta source config must include searchTerms and/or pageIds (Ad Library query parameters)."
    );
  }

  const accessToken = env.accessToken?.trim() || "mock-token-local-only";
  const client = new MetaAdLibraryClient(accessToken, env.apiVersion, env.baseUrl);

  return {
    accessToken,
    apiVersion: env.apiVersion,
    baseUrl: env.baseUrl,
    adReachedCountries: j.countries?.length ? j.countries : ["US"],
    searchTerm: j.searchTerms?.[0],
    pageIds: j.pageIds,
    adActiveStatus: j.adActiveStatus ?? "ALL",
    adType: j.adType ?? "ALL",
    defaultLimit: 50,
    rateLimiter: new RateLimiter(env.requestsPerHour, 60 * 60 * 1000),
    client,
    mockMode,
  };
}
