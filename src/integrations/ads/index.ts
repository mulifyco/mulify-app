import type { AdsProvider } from "./types";
import { mockAdsProvider } from "./providers/mockAdsProvider";
import { httpAdsProvider } from "./providers/httpAdsProvider";

export function getAdsProvider(): AdsProvider {
  const raw = (process.env.ADS_PROVIDER ?? "mock").trim().toLowerCase();
  switch (raw) {
    case "http":
      return httpAdsProvider;
    case "mock":
    default:
      return mockAdsProvider;
  }
}

