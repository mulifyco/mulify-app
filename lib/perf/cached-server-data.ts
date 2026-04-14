import { unstable_cache } from "next/cache";
import { getDashboardStats } from "@/server/services/dashboard.service";
import { buildOpsSourceHealth } from "@/server/services/ops-dashboard.service";
import { ReadyToScaleBoardRepository } from "@/server/repositories/ready-to-scale-board.repository";
import { MarketLeadersBoardRepository } from "@/server/repositories/market-leaders-board.repository";
import { EarlyMoversBoardRepository } from "@/server/repositories/early-movers-board.repository";
import { SaturatedProductsBoardRepository } from "@/server/repositories/saturated-products-board.repository";
import { CreativeWinnersBoardRepository } from "@/server/repositories/creative-winners-board.repository";
import { compareStores } from "@/server/services/store-compare.service";

/** Dashboard stats — short server cache to collapse duplicate hits (page + API clients). */
export const getCachedDashboardStats = unstable_cache(
  async () => getDashboardStats(),
  ["mulify-dashboard-stats"],
  { revalidate: 15 }
);

/** Full ops health — shared by dashboard preview and ops API. */
export const getCachedOpsSourceHealth = unstable_cache(
  async () => buildOpsSourceHealth(),
  ["mulify-ops-source-health"],
  { revalidate: 25 }
);

function cachedBoard(
  key: string,
  take: number,
  minScore: number,
  load: () => Promise<unknown[]>
): Promise<unknown[]> {
  return unstable_cache(load, ["mulify-board", key, String(take), String(minScore)], { revalidate: 20 })();
}

export async function getCachedReadyToScaleBoard(take: number, minScore: number) {
  return cachedBoard("rts", take, minScore, () =>
    ReadyToScaleBoardRepository.list({ take, minScore })
  ) as ReturnType<typeof ReadyToScaleBoardRepository.list>;
}

export async function getCachedMarketLeadersBoard(take: number, minScore: number) {
  return cachedBoard("ml", take, minScore, () =>
    MarketLeadersBoardRepository.list({ take, minScore })
  ) as ReturnType<typeof MarketLeadersBoardRepository.list>;
}

export async function getCachedEarlyMoversBoard(take: number, minScore: number) {
  return cachedBoard("em", take, minScore, () =>
    EarlyMoversBoardRepository.list({ take, minScore })
  ) as ReturnType<typeof EarlyMoversBoardRepository.list>;
}

export async function getCachedSaturatedProductsBoard(take: number, minScore: number) {
  return cachedBoard("sat", take, minScore, () =>
    SaturatedProductsBoardRepository.list({ take, minScore })
  ) as ReturnType<typeof SaturatedProductsBoardRepository.list>;
}

export async function getCachedCreativeWinnersBoard(take: number, minScore: number) {
  return cachedBoard("cw", take, minScore, () =>
    CreativeWinnersBoardRepository.list({ take, minScore })
  ) as ReturnType<typeof CreativeWinnersBoardRepository.list>;
}

/** Compare payload — key includes sorted ids so different selections don’t collide. */
export function getCachedCompareStoresKey(domains: string[], storeIds: string[]): string {
  const d = [...domains].map((x) => x.trim().toLowerCase()).filter(Boolean).sort().join("|");
  const s = [...storeIds].map((x) => x.trim()).filter(Boolean).sort().join("|");
  return `${d}__${s}`;
}

export async function getCachedCompareStores(domains: string[], storeIds: string[]) {
  const key = getCachedCompareStoresKey(domains, storeIds);
  return unstable_cache(
    async () => compareStores({ domains, storeIds }),
    ["mulify-compare", key],
    { revalidate: 15 }
  )();
}
