import prisma from "@/lib/prisma";

export type CreativeClusterPrismaDelegate = {
  findUnique: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown>;
  count: (args?: unknown) => Promise<number>;
  upsert: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
};

export function creativeClusterDb(): CreativeClusterPrismaDelegate {
  const root = prisma as unknown as Record<string, Partial<CreativeClusterPrismaDelegate> | undefined>;
  const d = root["creativeCluster"];
  if (!d?.findUnique || !d?.findMany || !d?.count || !d?.upsert || !d?.update) {
    throw new Error("Prisma creativeCluster delegate missing on client");
  }
  return d as CreativeClusterPrismaDelegate;
}
