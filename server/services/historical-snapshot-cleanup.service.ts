import prisma from "@/lib/prisma";
import { utcDayStart } from "@/lib/timeline/parse-range";

/**
 * Deletes snapshot rows older than retention (by snapshotDate). Not scheduled by default.
 * Future: cron / admin action.
 */
export async function deleteHistoricalSnapshotsOlderThan(retentionDays: number): Promise<{
  productCluster: number;
  creativeCluster: number;
  store: number;
  board: number;
}> {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.max(1, retentionDays));
  const cutoff = utcDayStart(d);

  const [a, b, c, e] = await Promise.all([
    prisma.productClusterSnapshot.deleteMany({ where: { snapshotDate: { lt: cutoff } } }),
    prisma.creativeClusterSnapshot.deleteMany({ where: { snapshotDate: { lt: cutoff } } }),
    prisma.storeSnapshot.deleteMany({ where: { snapshotDate: { lt: cutoff } } }),
    prisma.boardSnapshot.deleteMany({ where: { snapshotDate: { lt: cutoff } } }),
  ]);

  return {
    productCluster: a.count,
    creativeCluster: b.count,
    store: c.count,
    board: e.count,
  };
}
