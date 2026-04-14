function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * 0–100: strongest, most repeated, widest-store creative clusters.
 * Saturation is mildly positive; low merge confidence is penalized.
 */
export function computeCreativeWinnerScore(input: {
  scaleScore: number;
  saturationScore: number;
  creativeCount: number;
  storeCount: number;
  productClusterCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  confidence: number;
}): number {
  const scale = clamp(input.scaleScore, 0, 100);
  const stores = clamp((input.storeCount / 18) * 100, 0, 100);
  const products = clamp((Math.log1p(input.productClusterCount) / Math.log1p(22)) * 100, 0, 100);
  const creatives = clamp((Math.log1p(input.creativeCount) / Math.log1p(120)) * 100, 0, 100);
  const sat = clamp(input.saturationScore, 0, 100);

  const now = Date.now();
  const ageDays = (now - input.firstSeenAt.getTime()) / 86400000;
  const daysSinceLast = (now - input.lastSeenAt.getTime()) / 86400000;

  const longevity = clamp((Math.min(120, Math.max(0, ageDays)) / 120) * 100, 0, 100);
  const recency = clamp(100 - (Math.min(28, Math.max(0, daysSinceLast)) / 28) * 100, 0, 100);
  const durableActive = longevity * 0.52 + recency * 0.48;

  const conf = clamp(input.confidence, 0, 1);

  const raw =
    scale * 0.30 +
    stores * 0.22 +
    products * 0.12 +
    creatives * 0.10 +
    sat * 0.08 +
    durableActive * 0.12;

  const adjusted = raw * (0.38 + 0.62 * conf);

  return Math.round(clamp(adjusted, 0, 100) * 100) / 100;
}
