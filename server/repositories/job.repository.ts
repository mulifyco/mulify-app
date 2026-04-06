import prisma from "@/lib/prisma";
import type { JobStatus } from "@/types";
import type { Prisma } from "@prisma/client";

export interface ListJobsOptions {
  sourceId?: string;
  status?: JobStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const JobRepository = {
  async findById(id: string) {
    return prisma.ingestionJob.findUnique({
      where: { id },
      include: {
        source: { select: { id: true, name: true, type: true } },
        syncLogs: {
          orderBy: { createdAt: "desc" },
          take: 150,
        },
        rawRecords: {
          orderBy: { firstSeenAt: "desc" },
          take: 40,
          select: {
            id: true,
            externalId: true,
            entityType: true,
            status: true,
            firstSeenAt: true,
          },
        },
        _count: { select: { rawRecords: true } },
      },
    });
  },

  async list(options: ListJobsOptions = {}) {
    const { sourceId, status, search, page = 1, pageSize = 25 } = options;
    const skip = (page - 1) * pageSize;

    const q = search?.trim();
    const searchWhere: Prisma.IngestionJobWhereInput | undefined = q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" as const } },
            { source: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : undefined;

    const where: Prisma.IngestionJobWhereInput = {
      ...(sourceId ? { sourceId } : {}),
      ...(status ? { status } : {}),
      ...(searchWhere ?? {}),
    };

    const [data, total] = await Promise.all([
      prisma.ingestionJob.findMany({
        where,
        include: {
          source: { select: { id: true, name: true, type: true } },
          _count: { select: { rawRecords: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.ingestionJob.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async getLogs(jobId: string, page = 1, pageSize = 50) {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      prisma.syncLog.findMany({
        where: { jobId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.syncLog.count({ where: { jobId } }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },
};
