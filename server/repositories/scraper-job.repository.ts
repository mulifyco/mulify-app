import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface ListScraperJobsOptions {
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export const ScraperJobRepository = {
  async list(options: ListScraperJobsOptions = {}) {
    const { type, status, page = 1, pageSize = 25 } = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ScraperJobWhereInput = {
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.scraperJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.scraperJob.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  },
};

