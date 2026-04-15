import prisma from "@/lib/prisma";

export type SourcePrismaDelegate = {
  findUnique: (args: unknown) => Promise<unknown>;
  findFirst: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<unknown>;
  createMany: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  delete: (args: unknown) => Promise<unknown>;
  upsert: (args: unknown) => Promise<unknown>;
  groupBy: (args: unknown) => Promise<unknown>;
  aggregate: (args: unknown) => Promise<unknown>;
};

export function sourceDb(): SourcePrismaDelegate {
  const root = prisma as unknown as Record<string, Partial<SourcePrismaDelegate> | undefined>;
  const d = root["source"];
  if (
    !d?.findUnique ||
    !d?.findFirst ||
    !d?.findMany ||
    !d?.count ||
    !d?.create ||
    !d?.createMany ||
    !d?.update ||
    !d?.updateMany ||
    !d?.delete ||
    !d?.upsert ||
    !d?.groupBy ||
    !d?.aggregate
  ) {
    throw new Error("Prisma source delegate missing on client");
  }
  return d as SourcePrismaDelegate;
}
