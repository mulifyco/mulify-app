import type { SyncRunSummary } from "@/lib/sources/shared/types";
import { TikTokPageSourceAdapter } from "@/lib/sources/tiktok/adapter";
import { runPersistedSourceSync } from "@/lib/sources/ingestion/persisted-sync";

/**
 * TikTok profile / page → raw records → Ads (per video) + LandingPage stubs for outbound URLs.
 * Provider is best-effort: empty batches complete successfully (no throw).
 */
export async function runTikTokPageSync(params: {
  sourceId: string;
  triggeredBy?: string;
  initialJobCursor?: string;
}): Promise<SyncRunSummary> {
  const adapter = new TikTokPageSourceAdapter();

  return runPersistedSourceSync({
    adapter,
    sourceId: params.sourceId,
    expectedSourceType: "TIKTOK_PAGE",
    triggeredBy: params.triggeredBy ?? "manual",
    initialJobCursor: params.initialJobCursor,
  });
}
