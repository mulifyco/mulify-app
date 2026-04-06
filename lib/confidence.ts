// Confidence scoring framework
// Phase 1: rule-based scoring. Phase 2+: can be replaced with ML model.

import type {
  ConfidenceInput,
  ConfidenceLevel,
  ScoredConfidence,
  ConfidenceBreakdown,
} from "@/types";

const WEIGHTS = {
  source: 0.25,         // Is this from an official API?
  completeness: 0.30,   // How complete are the fields?
  confirmation: 0.20,   // Confirmed across multiple syncs?
  urlValidity: 0.15,    // Are URLs valid and reachable?
  linkage: 0.10,        // Linked to other entities?
};

/**
 * Compute confidence score for a normalized entity.
 *
 * Returns a score between 0.0 and 1.0, plus a breakdown.
 * This is intentionally simple in Phase 1 — extend by adding
 * new scoring dimensions to WEIGHTS and ConfidenceInput.
 */
export function computeConfidence(input: ConfidenceInput): ScoredConfidence {
  // Source score: official API = 1.0, scraped/inferred = 0.5, manual = 0.7
  const sourceScore = input.isOfficialApiSource ? 1.0 : 0.5;

  // Completeness: direct from field completeness ratio
  const completenessScore = Math.min(1, Math.max(0, input.fieldCompleteness));

  // Confirmation: score improves with repeated sync confirmation
  // 1 sync = 0.3, 3 syncs = 0.6, 5+ syncs = 1.0
  const confirmationScore = Math.min(1, 0.3 + (input.syncCount - 1) * 0.175);

  // URL validity
  const urlValidityScore = input.hasValidUrls ? 1.0 : 0.0;

  // Linkage: linked to other entities is a positive signal
  // 0 links = 0.2, 1 link = 0.6, 3+ links = 1.0
  const linkageScore = Math.min(1, 0.2 + input.linkedEntityCount * 0.267);

  const overallScore =
    WEIGHTS.source * sourceScore +
    WEIGHTS.completeness * completenessScore +
    WEIGHTS.confirmation * confirmationScore +
    WEIGHTS.urlValidity * urlValidityScore +
    WEIGHTS.linkage * linkageScore;

  const level = scoreToLevel(overallScore);

  const breakdown: ConfidenceBreakdown = {
    sourceScore,
    completenessScore,
    confirmationScore,
    urlValidityScore,
    linkageScore,
    details: {
      weights: WEIGHTS,
      inputs: {
        isOfficialApiSource: input.isOfficialApiSource,
        fieldCompleteness: input.fieldCompleteness,
        syncCount: input.syncCount,
        hasValidUrls: input.hasValidUrls,
        linkedEntityCount: input.linkedEntityCount,
      },
    },
  };

  return {
    ...breakdown,
    overallScore: Math.round(overallScore * 1000) / 1000,
    level,
    syncCount: input.syncCount,
  };
}

function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= 0.8) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
}

/**
 * Measure field completeness for an object.
 * Returns ratio of non-null/non-empty fields to total tracked fields.
 */
export function measureFieldCompleteness(
  obj: Record<string, unknown>,
  trackedFields: string[]
): number {
  if (trackedFields.length === 0) return 0;

  const filled = trackedFields.filter((field) => {
    const val = obj[field];
    if (val === null || val === undefined) return false;
    if (typeof val === "string" && val.trim() === "") return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  });

  return filled.length / trackedFields.length;
}

/**
 * Fields tracked for completeness scoring per entity type.
 */
export const COMPLETENESS_FIELDS = {
  AD: [
    "externalId", "pageId", "pageName", "adText", "adTitle",
    "destinationUrl", "platforms", "startDate", "isActive",
  ],
  STORE: [
    "domain", "name", "description", "platform", "country",
    "currency", "metaTitle",
  ],
  PRODUCT: [
    "handle", "title", "vendor", "productType", "url",
    "featuredImage", "priceMin", "isAvailable",
  ],
  COLLECTION: [
    "handle", "title", "url", "productCount",
  ],
  LANDING_PAGE: [
    "url", "domain", "title", "ogTitle", "httpStatus",
  ],
  ADVERTISER: [
    "externalId", "pageName", "pageUrl",
  ],
} as const;
