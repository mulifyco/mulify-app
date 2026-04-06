import type { EntityType } from "@prisma/client";
import { InferredLinkRepository } from "@/server/repositories/inferred-link.repository";
import { MergeCandidateRepository } from "@/server/repositories/merge-candidate.repository";
import { IntelligenceSignalRepository } from "@/server/repositories/intelligence-signal.repository";

export const IntelligenceContextRepository = {
  async getForEntity(entityType: EntityType, entityId: string) {
    const [inferred, mergeCandidates, signals] = await Promise.all([
      InferredLinkRepository.findForEntity(entityType, entityId),
      MergeCandidateRepository.findForEntity(entityType, entityId),
      IntelligenceSignalRepository.findForRelatedEntity(entityId, 40),
    ]);
    return {
      inferredOutgoing: inferred.outgoing,
      inferredIncoming: inferred.incoming,
      mergeCandidates,
      signals,
    };
  },
};
