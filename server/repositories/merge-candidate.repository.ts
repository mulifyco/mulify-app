import prisma from "@/lib/prisma";
import type { EntityType, MergeCandidateLevel, Prisma } from "@prisma/client";

function orderedPair(a: string, b: string): { primary: string; candidate: string } {
  return a < b ? { primary: a, candidate: b } : { primary: b, candidate: a };
}

export const MergeCandidateRepository = {
  orderedPair,

  async upsertCandidate(params: {
    entityType: EntityType;
    entityIdA: string;
    entityIdB: string;
    level: MergeCandidateLevel;
    confidence: number;
    mergeReason: string;
    supportingEntityIds: Prisma.InputJsonValue;
    conflictingFields?: Prisma.InputJsonValue | null;
  }) {
    const { primary, candidate } = orderedPair(params.entityIdA, params.entityIdB);
    if (primary === candidate) return null;
    const now = new Date();
    return prisma.mergeCandidate.upsert({
      where: {
        entityType_primaryEntityId_candidateEntityId: {
          entityType: params.entityType,
          primaryEntityId: primary,
          candidateEntityId: candidate,
        },
      },
      create: {
        entityType: params.entityType,
        primaryEntityId: primary,
        candidateEntityId: candidate,
        level: params.level,
        confidence: params.confidence,
        mergeReason: params.mergeReason,
        supportingEntityIds: params.supportingEntityIds,
        conflictingFields: params.conflictingFields ?? undefined,
        lastConfirmedAt: now,
      },
      update: {
        level: params.level,
        confidence: params.confidence,
        mergeReason: params.mergeReason,
        supportingEntityIds: params.supportingEntityIds,
        conflictingFields: params.conflictingFields ?? undefined,
        lastConfirmedAt: now,
      },
    });
  },

  async findForEntity(entityType: EntityType, entityId: string, take = 40) {
    return prisma.mergeCandidate.findMany({
      where: {
        entityType,
        OR: [{ primaryEntityId: entityId }, { candidateEntityId: entityId }],
      },
      orderBy: [{ confidence: "desc" }, { updatedAt: "desc" }],
      take,
    });
  },
};
