import type { EntityType } from "@prisma/client";

export const CONFIDENCE_V2_VERSION = 2 as const;

export interface ConfidenceBreakdownV2 {
  version: typeof CONFIDENCE_V2_VERSION;
  normalizedOverall: number;
  components: {
    fieldCompleteness: number;
    repeatedConfirmations: number;
    sourceDiversityBonus: number;
    linkedStore: number;
    linkedLandingPage: number;
    productGraphDepth: number;
    collectionConsistency: number;
    domainConfirmation: number;
    rawLineage: number;
    recentSuccessfulSyncs: number;
  };
  penalties: {
    stale: number;
    orphan: number;
    duplicateConflict: number;
    brokenLandingReference: number;
  };
  humanWarnings: string[];
}

export type IntelligenceReasonCode =
  | "FIELD_SPARSE"
  | "LOW_SYNC_CONFIRMATION"
  | "SINGLE_SOURCE_ONLY"
  | "LINKED_STORE"
  | "LINKED_LANDING_PAGE"
  | "DEEP_PRODUCT_GRAPH"
  | "COLLECTION_ALIGNED"
  | "DOMAIN_REPEATED"
  | "RAW_LINEAGE_STRONG"
  | "RECENT_SYNC_HEALTHY"
  | "STALE_ENTITY"
  | "ORPHAN_GRAPH"
  | "DUPLICATE_CONFLICT"
  | "BROKEN_LANDING_URL"
  | "WEAK_STORE_EXTRACTION";

export interface LinkUpsertInput {
  fromEntityType: EntityType;
  fromEntityId: string;
  toEntityType: EntityType;
  toEntityId: string;
  strengthDelta?: number;
  sourceReason: string;
  metadata?: Record<string, unknown>;
}

export interface OrchestratorResult {
  inferredLinksUpserted: number;
  entityLinksTouched: number;
  mergeCandidatesUpserted: number;
  signalsUpserted: number;
  confidenceV2Updated: number;
  trafficScoresUpdated: { stores: number; products: number };
  prominenceProductsUpdated: number;
  fusionUpdated: { stores: number; products: number; ads: number };
  errors: string[];
}
