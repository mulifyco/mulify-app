export function calculateTrendScore(input: {
  trafficGrowth1m: number; // ~ -1..+1 (or more)
  activeAds: number; // 0..N
  estimatedDailyRevenue: number; // >=0
  freshnessDays: number; // 0..N
}): number {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  const g = Number.isFinite(input.trafficGrowth1m) ? input.trafficGrowth1m : 0;
  const growthScore = clamp((g + 0.25) * 60, 0, 60); // center slightly positive

  const ads = Math.max(0, Math.floor(input.activeAds || 0));
  const adsScore = clamp(Math.log10(1 + ads) * 18, 0, 18);

  const rev = Math.max(0, input.estimatedDailyRevenue || 0);
  const revScore = clamp(Math.log10(1 + rev) * 18, 0, 18);

  const days = Math.max(0, Math.floor(input.freshnessDays || 0));
  const freshnessPenalty = clamp(days * 1.2, 0, 20); // older = lower score

  const raw = growthScore + adsScore + revScore - freshnessPenalty + 10; // small bias
  return clamp(raw, 0, 100);
}

