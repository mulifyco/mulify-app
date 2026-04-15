import prisma from "@/lib/prisma";

/** Narrow delegate surface: resolve `watchlist` on the client by name ( typings sometimes omit the delegate key). */
export type WatchlistPrismaDelegate = {
  findUnique: (args: unknown) => Promise<unknown>;
  findFirst: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

export function watchlistDb(): WatchlistPrismaDelegate {
  const root = prisma as unknown as Record<string, Partial<WatchlistPrismaDelegate> | undefined>;
  const d = root["watchlist"];
  if (
    !d?.findUnique ||
    !d?.findFirst ||
    !d?.findMany ||
    !d?.create ||
    !d?.update ||
    !d?.delete ||
    !d?.count ||
    !d?.updateMany
  ) {
    throw new Error("Prisma watchlist delegate missing on client");
  }
  return d as WatchlistPrismaDelegate;
}
