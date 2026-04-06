import prisma from "@/lib/prisma";
import type { EntityType, SourceType, RecordStatus } from "@/types";
import type { Prisma } from "@prisma/client";

export interface ListRawRecordsOptions {
  sourceId?: string;
  entityType?: EntityType;
  sourceType?: SourceType;
  status?: RecordStatus;
  search?: string;
  /** Records with at least one entity link vs none */
  linked?: "linked" | "unlinked";
  /** firstSeenAt >= date */
  ingestedAfter?: Date;
  page?: number;
  pageSize?: number;
}

export const RawRecordRepository = {
  async findById(id: string) {
    return prisma.rawRecord.findUnique({
      where: { id },
      include: {
        source: { select: { id: true, name: true, type: true } },
        job: { select: { id: true, status: true, startedAt: true, completedAt: true } },
        entityLinks: true,
      },
    });
  },

  async list(options: ListRawRecordsOptions = {}) {
    const {
      sourceId,
      entityType,
      sourceType,
      status,
      search,
      linked,
      ingestedAfter,
      page = 1,
      pageSize = 25,
    } = options;

    const skip = (page - 1) * pageSize;

    const q = search?.trim();
    const searchWhere: Prisma.RawRecordWhereInput | undefined = q
      ? {
          OR: [
            { externalId: { contains: q, mode: "insensitive" as const } },
            { id: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : undefined;

    const linkWhere: Prisma.RawRecordWhereInput | undefined =
      linked === "linked"
        ? { entityLinks: { some: {} } }
        : linked === "unlinked"
          ? { entityLinks: { none: {} } }
          : undefined;

    const where: Prisma.RawRecordWhereInput = {
      ...(sourceId ? { sourceId } : {}),
      ...(entityType ? { entityType } : {}),
      ...(sourceType ? { sourceType } : {}),
      ...(status ? { status } : {}),
      ...(ingestedAfter ? { firstSeenAt: { gte: ingestedAfter } } : {}),
      ...(searchWhere ?? {}),
      ...(linkWhere ?? {}),
    };

    const [data, total] = await Promise.all([
      prisma.rawRecord.findMany({
        where,
        include: {
          source: { select: { id: true, name: true, type: true } },
          job: { select: { id: true, status: true } },
          entityLinks: { take: 8, select: { id: true, entityType: true, entityId: true } },
          _count: { select: { entityLinks: true } },
        },
        orderBy: { firstSeenAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.rawRecord.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async getStats() {
    const byStatus = await prisma.rawRecord.groupBy({
      by: ["status"],
      _count: true,
    });

    const byEntityType = await prisma.rawRecord.groupBy({
      by: ["entityType"],
      _count: true,
    });

    return { byStatus, byEntityType };
  },
};
