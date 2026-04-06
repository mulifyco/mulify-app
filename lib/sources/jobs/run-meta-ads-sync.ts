import type { SyncRunSummary } from "@/lib/sources/shared/types";
import { MetaAdsSourceAdapter } from "@/lib/sources/meta/adapter";
import { runPersistedSourceSync } from "@/lib/sources/ingestion/persisted-sync";

/**
 * Validates config, runs Meta Ad Library ingestion with pagination, persists raw rows,
 * applies normalized entities, and returns a structured run summary.
 */
export async function runMetaAdsSync(params: {
  sourceId: string;
  triggeredBy?: string;
  initialJobCursor?: string;
}): Promise<SyncRunSummary> {
  const adapter = new MetaAdsSourceAdapter();

  return runPersistedSourceSync({
    adapter,
    sourceId: params.sourceId,
    expectedSourceType: "META_ADS",
    triggeredBy: params.triggeredBy ?? "manual",
    initialJobCursor: params.initialJobCursor,
    validateResolvedConfig: async (cfg) => {
      if (cfg.mockMode) return;
      await cfg.client.validateToken();
    },
  });
}
