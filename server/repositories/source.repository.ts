import prisma from "@/lib/prisma";
import type { SourceType, SourceStatus } from "@/types";
import { sourceHealthPrismaWhere } from "@/lib/admin/source-health";
import { jobWarningsList } from "@/lib/admin/jobs-metadata";
import type { Prisma } from "@prisma/client";

export interface CreateSourceInput {
  name: string;
  type: SourceType;
  config: Record<string, unknown>;
  domain?: string;
  pageUrl?: string;
  query?: string;
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
    const domain = input.domain?.trim() || undefined;
    const pageUrl = input.pageUrl?.trim() || undefined;
    const query = input.query?.trim() || undefined;

    const cfg = input.config ?? {};
    const cfgObj: Record<string, unknown> = cfg && typeof cfg === "object" ? cfg : {};
    const cfgStr = (k: string): string | undefined => {
      const v = cfgObj[k];
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const cfgBool = (k: string): boolean | undefined => {
      const v = cfgObj[k];
      return typeof v === "boolean" ? v : undefined;
    };
    const cfgNum = (k: string): number | undefined => {
      const v = cfgObj[k];
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    };
    const cfgStrArr = (k: string): string[] | undefined => {
      const v = cfgObj[k];
      if (!Array.isArray(v)) return undefined;
      return v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
    };

    // For SHOPIFY_DOMAIN sources, treat `domain` as the primary configuration if user didn't provide config.
    // We persist it into config too so adapters can resolve it without extra DB reads.
    const config =
      input.type === "SHOPIFY_DOMAIN"
        ? ({
            sourceDomain: domain ?? cfgStr("sourceDomain"),
            storeUrl: cfgStr("storeUrl"),
            targetDomains: cfgStrArr("targetDomains") ?? [],
            fetchStoreMeta: cfgBool("fetchStoreMeta") ?? true,
            fetchProducts: cfgBool("fetchProducts") ?? true,
            fetchCollections: cfgBool("fetchCollections") ?? true,
            maxProductsPerStore: cfgNum("maxProductsPerStore"),
            maxCollectionsPerStore: cfgNum("maxCollectionsPerStore"),
            pageSize: cfgNum("pageSize"),
          } satisfies Record<string, unknown>)
        : input.config;

    return prisma.source.create({
      data: {
        name: input.name,
        type: input.type,
        query,
        pageUrl,
        domain,
        config: config as never,
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
    const promoteScoreThreshold =
      Number.parseInt(process.env.DISCOVERY_PROMOTE_SCORE ?? "70", 10) || 70;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [total, byStatus, activeCandidates, highConfidenceCandidates, promotedThisWeek] = await Promise.all([
      prisma.source.count(),
      prisma.source.groupBy({ by: ["status"], _count: true }),
      prisma.discoveryCandidate.count({ where: { isPromoted: false } }).catch(() => 0),
      prisma.discoveryCandidate
        .count({ where: { isPromoted: false, discoveryScore: { gte: promoteScoreThreshold } } })
        .catch(() => 0),
      prisma.discoveryCandidate.count({ where: { isPromoted: true, promotedAt: { gte: weekAgo } } }).catch(() => 0),
    ]);
    const active = byStatus.find((s) => s.status === "ACTIVE")?._count ?? 0;
    const inError = byStatus.find((s) => s.status === "ERROR")?._count ?? 0;
    return {
      total,
      active,
      inError,
      activeCandidates,
      highConfidenceCandidates,
      promotedThisWeek,
      promoteScoreThreshold,
    };
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
