export type SyncRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PARTIAL";

export function shouldBlockNewEnqueue(status: SyncRunStatus | null | undefined): boolean {
  return status === "PENDING" || status === "RUNNING";
}

