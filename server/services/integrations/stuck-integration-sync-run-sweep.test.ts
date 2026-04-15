import { describe, expect, it } from "vitest";
import { integrationRunStaleCutoff, isStaleRunningIntegrationRun } from "./stuck-integration-sync-run-helpers";

describe("integration stuck run sweep helpers", () => {
  it("computes cutoff correctly and marks stale RUNNING runs", () => {
    const now = new Date("2026-01-01T00:30:00.000Z");
    const cutoff = integrationRunStaleCutoff(now, 15 * 60 * 1000);
    expect(cutoff.toISOString()).toBe("2026-01-01T00:15:00.000Z");

    expect(
      isStaleRunningIntegrationRun({
        status: "RUNNING",
        startedAt: new Date("2026-01-01T00:10:00.000Z"),
        completedAt: null,
        cutoff,
      })
    ).toBe(true);

    expect(
      isStaleRunningIntegrationRun({
        status: "RUNNING",
        startedAt: new Date("2026-01-01T00:20:00.000Z"),
        completedAt: null,
        cutoff,
      })
    ).toBe(false);
  });
});

