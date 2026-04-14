import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { msFromEnv } from "@/lib/sources/reliability";

const STALE_MSG = "stale_running_job_swept";

/**
 * Marks ingestion jobs stuck in RUNNING past threshold as FAILED so workers can proceed.
 */
export async function sweepStuckIngestionJobs(): Promise<number> {
  const thresholdMs = msFromEnv("INGESTION_JOB_STUCK_MS", 45 * 60 * 1000);
  const cutoff = new Date(Date.now() - thresholdMs);

  const stuck = await prisma.ingestionJob.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: cutoff },
    },
    select: { id: true, startedAt: true, sourceId: true },
  });

  const now = new Date();
  for (const j of stuck) {
    const durationMs = j.startedAt ? now.getTime() - j.startedAt.getTime() : thresholdMs;
    await prisma.ingestionJob.update({
      where: { id: j.id },
      data: {
        status: "FAILED",
        completedAt: now,
        durationMs,
        error: STALE_MSG,
      },
    });
  }

  if (stuck.length > 0) {
    logger.warn("[stuck-job-sweep] ingestion jobs marked failed", { count: stuck.length });
  }
  return stuck.length;
}

/**
 * Scraper/worker wrapper jobs left RUNNING (e.g. process crash) → FAILED.
 */
export async function sweepStuckScraperJobs(): Promise<number> {
  const thresholdMs = msFromEnv("SCRAPER_JOB_STUCK_MS", 3 * 60 * 60 * 1000);
  const cutoff = new Date(Date.now() - thresholdMs);

  const stuck = await prisma.scraperJob.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: cutoff },
    },
    select: { id: true },
  });

  const now = new Date();
  for (const j of stuck) {
    await prisma.scraperJob.update({
      where: { id: j.id },
      data: {
        status: "FAILED",
        finishedAt: now,
        error: STALE_MSG,
      },
    });
  }

  if (stuck.length > 0) {
    logger.warn("[stuck-job-sweep] scraper jobs marked failed", { count: stuck.length });
  }
  return stuck.length;
}

export async function sweepAllStuckJobs(): Promise<{
  ingestionJobsRecovered: number;
  scraperJobsRecovered: number;
}> {
  const [ingestionJobsRecovered, scraperJobsRecovered] = await Promise.all([
    sweepStuckIngestionJobs(),
    sweepStuckScraperJobs(),
  ]);
  return { ingestionJobsRecovered, scraperJobsRecovered };
}
