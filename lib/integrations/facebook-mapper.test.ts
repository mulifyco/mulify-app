import { describe, expect, it } from "vitest";
import { mapFacebookPayloadsToIntegrationRecords } from "./facebook-mapper";

describe("mapFacebookPayloadsToIntegrationRecords", () => {
  it("maps campaigns/adsets/ads and insights with stable externalId", () => {
    const records = mapFacebookPayloadsToIntegrationRecords({
      campaigns: [{ id: "c1", name: "Camp" }],
      adsets: [{ id: "as1", name: "Adset" }],
      ads: [{ id: "ad1", name: "Ad" }],
      insights: [{ ad_id: "ad1", date_start: "2026-01-01", date_stop: "2026-01-02", spend: "1.23" }],
    });

    expect(records.some((r) => r.entityType === "CAMPAIGN" && r.externalId === "c1")).toBe(true);
    expect(records.some((r) => r.entityType === "ADSET" && r.externalId === "as1")).toBe(true);
    expect(records.some((r) => r.entityType === "AD" && r.externalId === "ad1")).toBe(true);
    expect(records.some((r) => r.entityType === "INSIGHT" && r.externalId === "ad1:2026-01-01:2026-01-02")).toBe(true);
  });
});

