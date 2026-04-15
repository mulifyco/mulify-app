import prisma from "@/lib/prisma";

export type ReviewQueueItemPrismaDelegate = {
  findFirst: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

export function reviewQueueItemDb(): ReviewQueueItemPrismaDelegate {
  const root = prisma as unknown as Record<string, Partial<ReviewQueueItemPrismaDelegate> | undefined>;
  const d = root["reviewQueueItem"];
  if (!d?.findFirst || !d?.findMany || !d?.count || !d?.create || !d?.update || !d?.updateMany) {
    throw new Error("Prisma reviewQueueItem delegate missing on client");
  }
  return d as ReviewQueueItemPrismaDelegate;
}
