import prisma from "@/lib/prisma";
import type { SourceType, SourceStatus } from "@/types";
import { sourceHealthPrismaWhere } from "@/lib/admin/source-health";
import { jobWarningsList } from "@/lib/admin/jobs-metadata";
import type { Prisma } from "@prisma/client";

export interface CreateSourceInput {
  name: string;
  type: SourceType;
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ListSourcesOptions {
  type?: SourceType;
  status?: SourceStatus;
  /** UI health bucket */
  health?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const SourceRepository = {
  async findById(id: string) {
    return prisma.source.findUnique({
      where: { id },
      include: {
        _count: {
          select: { ingestionJobs: true, rawRecords: true },
        },
      },
    });
  },

  async list(options: ListSourcesOptions = {}) {
    const { type, status, health, search, page = 1, pageSize = 25 } = options;
    const skip = (page - 1) * pageSize;

    const healthWhere = sourceHealthPrismaWhere(health);

    const where: Prisma.SourceWhereInput = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(healthWhere ?? {}),
      ...(search?.trim()
        ? {
            name: { contains: search.trim(), mode: "insensitive" as const },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.source.findMany({
        where,
        include: {
          _count: { select: { ingestionJobs: true, rawRecords: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.source.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },

  async create(input: CreateSourceInput) {
    return prisma.source.create({
      data: {
        name: input.name,
        type: input.type,
        config: input.config as never,
        metadata: input.metadata as never,
        status: "PENDING",
      },
    });
  },

  async updateStatus(id: string, status: SourceStatus, error?: string) {
    return prisma.source.update({
      where: { id },
      data: {
        status,
        ...(error ? { lastError: error, errorCount: { increment: 1 } } : {}),
      },
    });
  },

  async updateConfig(id: string, config: Record<string, unknown>) {
    return prisma.source.update({
      where: { id },
      data: { config: config as never },
    });
  },

  async delete(id: string) {
    return prisma.source.delete({ where: { id } });
  },

  async getRecentJobs(sourceId: string, limit = 10) {
    return prisma.ingestionJob.findMany({
      where: { sourceId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  /** Last success / failed job + de-duplicated warning strings from recent runs. */
  async globalStats() {
    const [total, byStatus] = await Promise.all([
      prisma.source.count(),
      prisma.source.groupBy({ by: ["status"], _count: true }),
    ]);
    const active = byStatus.find((s) => s.status === "ACTIVE")?._count ?? 0;
    const inError = byStatus.find((s) => s.status === "ERROR")?._count ?? 0;
    return { total, active, inError };
  },

  async getOperationalDigest(sourceId: string) {
    const jobs = await prisma.ingestionJob.findMany({
      where: { sourceId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        status: true,
        completedAt: true,
        startedAt: true,
        createdAt: true,
        metadata: true,
        error: true,
        totalFetched: true,
        totalNormalized: true,
        totalFailed: true,
      },
    });

    const lastSuccess = jobs.find((j) => j.status === "COMPLETED");
    const lastFailed = jobs.find((j) => j.status === "FAILED");
    const warnSet = new Set<string>();
    for (const j of jobs.slice(0, 12)) {
      for (const w of jobWarningsList(j.metadata)) {
        if (w.trim()) warnSet.add(w.trim());
      }
    }

    return {
      lastSuccess,
      lastFailed,
      recentWarnings: [...warnSet].slice(0, 25),
    };
  },
};
