export type SyncState = "IDLE" | "QUEUED" | "RUNNING" | "FAILED";

export function shouldPollForSyncState(state: SyncState): boolean {
  return state === "QUEUED" || state === "RUNNING";
}

export function pollingExceeded(args: { attempts: number; maxAttempts: number; elapsedMs: number; maxElapsedMs: number }): boolean {
  if (args.attempts >= args.maxAttempts) return true;
  if (args.elapsedMs >= args.maxElapsedMs) return true;
  return false;
}

