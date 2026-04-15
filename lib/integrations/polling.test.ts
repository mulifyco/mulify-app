import { describe, expect, it } from "vitest";
import { pollingExceeded, shouldPollForSyncState } from "./polling";

describe("polling helpers", () => {
  it("polls only when queued/running", () => {
    expect(shouldPollForSyncState("IDLE")).toBe(false);
    expect(shouldPollForSyncState("FAILED")).toBe(false);
    expect(shouldPollForSyncState("QUEUED")).toBe(true);
    expect(shouldPollForSyncState("RUNNING")).toBe(true);
  });

  it("stops polling when limits are exceeded", () => {
    expect(pollingExceeded({ attempts: 0, maxAttempts: 10, elapsedMs: 0, maxElapsedMs: 60_000 })).toBe(false);
    expect(pollingExceeded({ attempts: 10, maxAttempts: 10, elapsedMs: 0, maxElapsedMs: 60_000 })).toBe(true);
    expect(pollingExceeded({ attempts: 0, maxAttempts: 10, elapsedMs: 60_000, maxElapsedMs: 60_000 })).toBe(true);
  });
});

