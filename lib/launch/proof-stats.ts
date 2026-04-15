import prisma from "@/lib/prisma";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";

export type LaunchProofStats = {
  shopCount: number;
  adCount: number;
  productClusterCount: number;
  creativeClusterCount: number;
  sourceCount: number;
  snapshotRowsLast24h: number;
};

/**
 * Best-effort counts for marketing social proof (public landing).
 */
export async function getLaunchProofStats(): Promise<LaunchProofStats> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    shopCount,
    adCount,
    productClusterCount,
    creativeClusterCount,
    sourceCount,
    snapshotRowsLast24h,
  ] = await Promise.all([
    prisma.shop.count().catch(() => 0),
    prisma.ad.count().catch(() => 0),
    prisma.productCluster.count().catch(() => 0),
    creativeClusterDb().count().catch(() => 0),
    prisma.source.count().catch(() => 0),
    prisma.productClusterSnapshot
      .count({ where: { snapshotDate: { gte: dayAgo } } })
      .catch(() => 0),
  ]);
  return {
    shopCount,
    adCount,
    productClusterCount,
    creativeClusterCount,
    sourceCount,
    snapshotRowsLast24h,
  };
}
