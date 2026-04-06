import { runLinkingPass } from "@/server/intelligence/linking.service";
import { runMergeCandidateSweep } from "@/server/intelligence/merge-candidate.service";
import { runSignalSweep } from "@/server/intelligence/signal.service";
import { batchRecomputeConfidenceV2 } from "@/server/intelligence/confidence-v2.service";
import { batchRecomputeTrafficScores } from "@/server/intelligence/traffic-score.service";
import { batchRecomputeProductProminence } from "@/server/intelligence/prominence-engine.service";
import { batchRecomputeFusionScores } from "@/server/intelligence/fusion-score.service";
import { InferredLinkRepository } from "@/server/repositories/inferred-link.repository";
import type { OrchestratorResult } from "@/server/intelligence/types";

export type IntelligenceStage =
  | "linking"
  | "merge"
  | "signals"
  | "confidence_v2"
  | "traffic"
  | "prominence"
  | "fusion"
  | "stale_decay";

export async function runIntelligenceOrchestrator(options: {
  stages?: IntelligenceStage[];
  linking?: { maxAds?: number };
  merge?: { maxPairsPerKind?: number };
  confidence?: { limitPerType?: number; syncLegacyScores?: boolean };
  traffic?: { storeLimit?: number; productLimit?: number };
  prominence?: { productLimit?: number };
  fusion?: { storeLimit?: number; productLimit?: number; adLimit?: number };
  staleDecayBefore?: Date;
} = {}): Promise<OrchestratorResult> {
  const stages = options.stages ?? [
    "linking",
    "merge",
    "signals",
    "confidence_v2",
    "traffic",
    "prominence",
    "fusion",
    "stale_decay",
  ];

  const errors: string[] = [];
  let inferredLinksUpserted = 0;
  let entityLinksTouched = 0;
  let mergeCandidatesUpserted = 0;
  let signalsUpserted = 0;
  let confidenceV2Updated = 0;
  let trafficStores = 0;
  let trafficProducts = 0;
  let prominenceProductsUpdated = 0;
  let fusionStores = 0;
  let fusionProducts = 0;
  let fusionAds = 0;

  try {
    if (stages.includes("linking")) {
      const r = await runLinkingPass(options.linking ?? {});
      inferredLinksUpserted += r.inferredUpserts;
      entityLinksTouched += r.entityLinksStrengthened;
    }
  } catch (e) {
    errors.push(`linking: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (stages.includes("merge")) {
      const r = await runMergeCandidateSweep(options.merge ?? {});
      mergeCandidatesUpserted += r.upserted;
    }
  } catch (e) {
    errors.push(`merge: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (stages.includes("signals")) {
      const r = await runSignalSweep();
      signalsUpserted += r.written;
    }
  } catch (e) {
    errors.push(`signals: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (stages.includes("confidence_v2")) {
      const r = await batchRecomputeConfidenceV2({
        limitPerType: options.confidence?.limitPerType,
        syncLegacyScores: options.confidence?.syncLegacyScores ?? false,
      });
      confidenceV2Updated += r.updated;
    }
  } catch (e) {
    errors.push(`confidence_v2: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (stages.includes("traffic")) {
      const r = await batchRecomputeTrafficScores({
        storeLimit: options.traffic?.storeLimit,
        productLimit: options.traffic?.productLimit,
      });
      trafficStores += r.stores;
      trafficProducts += r.products;
      if (r.errors.length) {
        errors.push(`traffic: ${r.errors.length} entity recompute failures`);
        for (const msg of r.errors.slice(0, 15)) {
          errors.push(`traffic: ${msg}`);
        }
      }
    }
  } catch (e) {
    errors.push(`traffic: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (stages.includes("prominence")) {
      const r = await batchRecomputeProductProminence({
        limit: options.prominence?.productLimit,
      });
      prominenceProductsUpdated += r.updated;
      if (r.errors.length) {
        errors.push(`prominence: ${r.errors.length} product failures`);
        for (const msg of r.errors.slice(0, 12)) {
          errors.push(`prominence: ${msg}`);
        }
      }
    }
  } catch (e) {
    errors.push(`prominence: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (stages.includes("fusion")) {
      const r = await batchRecomputeFusionScores({
        storeLimit: options.fusion?.storeLimit,
        productLimit: options.fusion?.productLimit,
        adLimit: options.fusion?.adLimit,
      });
      fusionStores += r.stores;
      fusionProducts += r.products;
      fusionAds += r.ads;
      if (r.errors.length) {
        errors.push(`fusion: ${r.errors.length} entity failures`);
        for (const msg of r.errors.slice(0, 12)) {
          errors.push(`fusion: ${msg}`);
        }
      }
    }
  } catch (e) {
    errors.push(`fusion: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    if (stages.includes("stale_decay")) {
      const since = options.staleDecayBefore ?? new Date(Date.now() - 21 * 86400000);
      await InferredLinkRepository.markStaleIfNotConfirmedSince(since);
    }
  } catch (e) {
    errors.push(`stale_decay: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    inferredLinksUpserted,
    entityLinksTouched,
    mergeCandidatesUpserted,
    signalsUpserted,
    confidenceV2Updated,
    trafficScoresUpdated: { stores: trafficStores, products: trafficProducts },
    prominenceProductsUpdated,
    fusionUpdated: { stores: fusionStores, products: fusionProducts, ads: fusionAds },
    errors,
  };
}
