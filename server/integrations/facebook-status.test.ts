import { describe, expect, it } from "vitest";
import { buildFacebookStatus } from "./facebook-status";

describe("buildFacebookStatus", () => {
  it("returns default when row is null", () => {
    const res = buildFacebookStatus({ row: null, syncInProgress: false, latestRun: null });
    expect(res.status).toBe("DISCONNECTED");
    expect(res.connected).toBe(false);
    expect(res.hasCredentials).toBe(false);
    expect(res.lastError).toBeNull();
    expect(res.syncState).toBe("IDLE");
  });

  it("forces DISCONNECTED when no credentials", () => {
    const res = buildFacebookStatus({
      row: {
        id: "c1",
        provider: "FACEBOOK",
        status: "CONNECTED",
        encryptedConfig: null,
        publicConfig: { adAccountId: "act_1234567890" },
        lastSyncedAt: null,
        lastError: "should not leak",
      },
      syncInProgress: true,
      latestRun: { id: "r1", status: "RUNNING", startedAt: new Date(), completedAt: null },
    });
    expect(res.status).toBe("DISCONNECTED");
    expect(res.connected).toBe(false);
    expect(res.hasCredentials).toBe(false);
    expect(res.lastError).toBeNull();
    expect(res.syncInProgress).toBe(true);
    // Even if a run exists, state should still reflect it.
    expect(res.syncState).toBe("RUNNING");
  });

  it("maps latest run status to syncState", () => {
    const baseRow = {
      id: "c1",
      provider: "FACEBOOK" as const,
      status: "CONNECTED" as const,
      encryptedConfig: "enc",
      publicConfig: { adAccountId: "act_1234567890" },
      lastSyncedAt: null,
      lastError: null,
    };
    expect(buildFacebookStatus({ row: baseRow, syncInProgress: false, latestRun: { id: "r1", status: "PENDING", startedAt: null, completedAt: null } }).syncState).toBe("QUEUED");
    expect(buildFacebookStatus({ row: baseRow, syncInProgress: true, latestRun: { id: "r2", status: "RUNNING", startedAt: new Date(), completedAt: null } }).syncState).toBe("RUNNING");
    expect(buildFacebookStatus({ row: baseRow, syncInProgress: false, latestRun: { id: "r3", status: "FAILED", startedAt: new Date(), completedAt: new Date() } }).syncState).toBe("FAILED");
    expect(buildFacebookStatus({ row: baseRow, syncInProgress: false, latestRun: { id: "r4", status: "COMPLETED", startedAt: new Date(), completedAt: new Date() } }).syncState).toBe("IDLE");
  });
});

