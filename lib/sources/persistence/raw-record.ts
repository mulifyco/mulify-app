/**
 * Raw payload persistence — idempotent by (sourceId, externalId, entityType).
 */

import type { SourceType } from "@/types";
import type { RawEntityType } from "@/lib/sources/shared/types";
import prisma from "@/lib/prisma";
import { hashPayload } from "@/lib/hash";

export interface PersistRawResult {
  id: string;
  isNew: boolean;
}

export async function persistRawPayload(params: {
  sourceId: string;
  jobId: string | null;
  sourceType: SourceType;
  externalId: string;
  entityType: RawEntityType;
  payload: unknown;
}): Promise<PersistRawResult> {
  const payloadHash = hashPayload(params.payload);

  const existing = await prisma.rawRecord.findUnique({
    where: {
      sourceId_externalId_entityType: {
        sourceId: params.sourceId,
        externalId: params.externalId,
        entityType: params.entityType,
      },
    },
  });

  if (existing) {
    await prisma.rawRecord.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        payloadHash,
        rawPayload: params.payload as never,
        jobId: params.jobId,
      },
    });
    return { id: existing.id, isNew: false };
  }

  const created = await prisma.rawRecord.create({
    data: {
      sourceId: params.sourceId,
      jobId: params.jobId,
      sourceType: params.sourceType,
      externalId: params.externalId,
      entityType: params.entityType,
      rawPayload: params.payload as never,
      payloadHash,
    },
  });

  return { id: created.id, isNew: true };
}
