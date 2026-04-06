import prisma from "@/lib/prisma";
import type { EntityType, Prisma } from "@prisma/client";

export const InferredLinkRepository = {
  async upsertConfirm(params: {
    fromEntityType: EntityType;
    fromEntityId: string;
    toEntityType: EntityType;
    toEntityId: string;
    strength: number;
    sourceReason: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    const now = new Date();
    const existing = await prisma.inferredLink.findUnique({
      where: {
        fromEntityType_fromEntityId_toEntityType_toEntityId: {
          fromEntityType: params.fromEntityType,
          fromEntityId: params.fromEntityId,
          toEntityType: params.toEntityType,
          toEntityId: params.toEntityId,
        },
      },
    });
    const nextStrength = existing
      ? Math.min(1, Math.max(params.strength, existing.strength + 0.03))
      : params.strength;

    return prisma.inferredLink.upsert({
      where: {
        fromEntityType_fromEntityId_toEntityType_toEntityId: {
          fromEntityType: params.fromEntityType,
          fromEntityId: params.fromEntityId,
          toEntityType: params.toEntityType,
          toEntityId: params.toEntityId,
        },
      },
      create: {
        fromEntityType: params.fromEntityType,
        fromEntityId: params.fromEntityId,
        toEntityType: params.toEntityType,
        toEntityId: params.toEntityId,
        strength: nextStrength,
        sourceReason: params.sourceReason,
        metadata: params.metadata ?? undefined,
        firstLinkedAt: now,
        lastConfirmedAt: now,
        staleAt: null,
      },
      update: {
        strength: nextStrength,
        sourceReason: params.sourceReason,
        metadata: params.metadata ?? undefined,
        lastConfirmedAt: now,
        staleAt: null,
      },
    });
  },

  async findForEntity(entityType: EntityType, entityId: string, take = 80) {
    const [outgoing, incoming] = await Promise.all([
      prisma.inferredLink.findMany({
        where: { fromEntityType: entityType, fromEntityId: entityId },
        orderBy: { lastConfirmedAt: "desc" },
        take,
      }),
      prisma.inferredLink.findMany({
        where: { toEntityType: entityType, toEntityId: entityId },
        orderBy: { lastConfirmedAt: "desc" },
        take,
      }),
    ]);
    return { outgoing, incoming };
  },

  async markStaleIfNotConfirmedSince(since: Date) {
    const res = await prisma.inferredLink.updateMany({
      where: {
        staleAt: null,
        lastConfirmedAt: { lt: since },
      },
      data: { staleAt: new Date() },
    });
    return res.count;
  },
};
