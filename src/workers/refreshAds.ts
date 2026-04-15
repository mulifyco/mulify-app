import prisma from "@/src/lib/prisma";
import { getAdsProvider } from "@/src/integrations/ads";
import { upsertExternalAdsBatch } from "@/src/integrations/ads/upsert";
import { sourceDb } from "@/lib/prisma-source-delegate";

function asNonEmptyString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function buildFacebookAdsLibraryKeywordUrl(input: { query: string; country?: string }): string {
  const country = (input.country ?? "US").trim().toUpperCase() || "US";
  const q = encodeURIComponent(input.query.trim());
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&q=${q}`;
}

export async function refreshAdsJob(): Promise<{
  sourcesProcessed: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  shopsUpdated: number;
  adsUpdated: number;
  skipped: boolean;
}> {
  const provider = getAdsProvider();
  const sources = (await sourceDb().findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      type: true,
      query: true,
      pageUrl: true,
      country: true,
      priority: true,
      errorCount: true,
    },
  })) as Array<{
    id: string;
    type: string;
    query: string | null;
    pageUrl: string | null;
    country: string | null;
    priority: number;
    errorCount: number;
  }>;

  let sourcesProcessed = 0;
  let sourcesSucceeded = 0;
  let sourcesFailed = 0;
  let shopsUpdated = 0;
  let adsUpdated = 0;
  let skipped = true;

  // Process sources in priority order. Support only KEYWORD for now.
  for (const s of sources) {
    let startUrl: string | undefined;
    if (s.type === "KEYWORD") {
      const q = asNonEmptyString(s.query);
      if (q) startUrl = buildFacebookAdsLibraryKeywordUrl({ query: q, country: s.country ?? undefined });
    } else {
      continue;
    }

    if (!startUrl) continue;
    sourcesProcessed += 1;

    try {
      const { batch } = await (provider as any).fetchLatestAds({
        limitAds: 20,
        limitShops: 3,
        // Provider may ignore this (e.g. mock), but keeps the call source-aware without touching provider files.
        startUrls: [{ url: startUrl }],
        sourceId: s.id,
        sourceType: s.type,
      });

      const hasUsableItems = (batch.ads?.length ?? 0) > 0 || (batch.shops?.length ?? 0) > 0;
      if (!hasUsableItems) {
        sourcesFailed += 1;
        await sourceDb().update({
          where: { id: s.id },
          data: {
            lastErrorAt: new Date(),
            errorCount: { increment: 1 },
          },
        });
        // eslint-disable-next-line no-console
        console.info("[ads:http] no usable items for source", { sourceId: s.id, type: s.type, url: startUrl });
        continue;
      }

      const result = await upsertExternalAdsBatch(batch);
      shopsUpdated += result.shopsUpserted;
      adsUpdated += result.adsUpserted;
      skipped = false;

      await sourceDb().update({
        where: { id: s.id },
        data: {
          lastSyncedAt: new Date(),
          lastSuccessAt: new Date(),
          errorCount: 0,
          lastErrorAt: null,
        },
      });

      sourcesSucceeded += 1;
    } catch (e) {
      sourcesFailed += 1;
      await sourceDb().update({
        where: { id: s.id },
        data: {
          lastErrorAt: new Date(),
          errorCount: { increment: 1 },
        },
      });
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.warn("[worker:refreshAds] source failed", { sourceId: s.id, type: s.type, msg });
    }
  }

  // eslint-disable-next-line no-console
  console.info("[worker:refreshAds] done", {
    sourcesProcessed,
    sourcesSucceeded,
    sourcesFailed,
    shopsUpdated,
    adsUpdated,
    skipped,
  });

  return { sourcesProcessed, sourcesSucceeded, sourcesFailed, shopsUpdated, adsUpdated, skipped };
}

