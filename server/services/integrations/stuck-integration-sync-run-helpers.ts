export const STALE_INTEGRATION_RUN_ERROR = "Worker interrupted or job timed out";

export function integrationRunStaleCutoff(now: Date, staleAfterMs: number): Date {
  return new Date(now.getTime() - staleAfterMs);
}

export function isStaleRunningIntegrationRun(args: {
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  cutoff: Date;
}): boolean {
  if (args.status !== "RUNNING") return false;
  if (!args.startedAt) return false;
  if (args.completedAt) return false;
  return args.startedAt.getTime() < args.cutoff.getTime();
}

