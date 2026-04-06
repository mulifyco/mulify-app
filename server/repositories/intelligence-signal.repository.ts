import prisma from "@/lib/prisma";
import type { Prisma, SignalSeverity } from "@prisma/client";

export const IntelligenceSignalRepository = {
  buildDedupeKey(type: string, relatedIds: string[]): string {
    const sorted = [...relatedIds].filter(Boolean).sort();
    return `${type}:${sorted.join(",")}`;
  },

  async upsertSignal(params: {
    type: string;
    severity: SignalSeverity;
    confidence: number;
    relatedEntityIds: Prisma.InputJsonValue;
    evidence?: Prisma.InputJsonValue | null;
    dedupeKey: string;
  }) {
    const now = new Date();
    return prisma.intelligenceSignal.upsert({
      where: { dedupeKey: params.dedupeKey },
      create: {
        type: params.type,
        severity: params.severity,
        confidence: params.confidence,
        relatedEntityIds: params.relatedEntityIds,
        evidence: params.evidence ?? undefined,
        dedupeKey: params.dedupeKey,
        firstSeenAt: now,
        lastSeenAt: now,
        active: true,
      },
      update: {
        severity: params.severity,
        confidence: params.confidence,
        relatedEntityIds: params.relatedEntityIds,
        evidence: params.evidence ?? undefined,
        lastSeenAt: now,
        active: true,
      },
    });
  },

  async findForRelatedEntity(entityId: string, take = 30) {
    const rows = await prisma.intelligenceSignal.findMany({
      where: { active: true },
      orderBy: { lastSeenAt: "desc" },
      take: 400,
    });
    return rows
      .filter((r) => {
        const ids = r.relatedEntityIds;
        if (Array.isArray(ids)) return ids.includes(entityId);
        return false;
      })
      .slice(0, take);
  },

  async deactivateMissingKeys(activeDedupeKeys: Set<string>, typePrefix?: string) {
    const where =
      typePrefix != null
        ? { type: { startsWith: typePrefix }, active: true }
        : { active: true };
    const all = await prisma.intelligenceSignal.findMany({
      where,
      select: { id: true, dedupeKey: true },
    });
    const toDeactivate = all.filter(
      (r) => r.dedupeKey && !activeDedupeKeys.has(r.dedupeKey)
    );
    if (!toDeactivate.length) return 0;
    const res = await prisma.intelligenceSignal.updateMany({
      where: { id: { in: toDeactivate.map((x) => x.id) } },
      data: { active: false },
    });
    return res.count;
  },
};
