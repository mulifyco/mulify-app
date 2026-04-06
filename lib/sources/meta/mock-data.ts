/**
 * Deterministic fixtures for local / offline ingestion tests.
 * Not real ads — shape matches MetaAdRawPayload for mapper coverage.
 */

import type { MetaAdRawPayload } from "@/types";

export const MOCK_META_ADS: MetaAdRawPayload[] = [
  {
    id: "mock_meta_ad_library_local_001",
    page_id: "123456789012345",
    page_name: "Mock Advertiser (Local)",
    ad_creative_bodies: ["Sample body copy for local mock ingestion."],
    ad_creative_link_titles: ["Mock headline"],
    ad_creative_link_descriptions: ["Supporting description line."],
    ad_delivery_start_time: "2025-01-01T00:00:00+0000",
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=mock_meta_ad_library_local_001",
    publisher_platforms: ["facebook", "instagram"],
    languages: ["en"],
    currency: "USD",
  },
  {
    id: "mock_meta_ad_library_local_002",
    page_id: "123456789012345",
    page_name: "Mock Advertiser (Local)",
    ad_creative_bodies: ["Second mock creative — no stop time (active unknown)."],
    ad_creative_link_titles: ["Another headline"],
    ad_delivery_start_time: "2025-02-15T12:00:00+0000",
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=mock_meta_ad_library_local_002",
    publisher_platforms: ["facebook"],
    languages: ["en"],
  },
];
