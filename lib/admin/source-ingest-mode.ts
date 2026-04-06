import type { SourceType } from "@/types";
import { shouldMockAllSourceApis, shouldMockMetaAdsApis } from "@/config";

/**
 * High-level live vs mock hint for ops (global env + source type).
 * Per-source mock flags in JSON config win when set.
 */
export function sourceIngestModeLabel(
  type: SourceType,
  config: unknown
): "Mock" | "Live" {
  if (config && typeof config === "object") {
    const c = config as { mockMode?: unknown };
    if (c.mockMode === true) return "Mock";
    if (c.mockMode === false) return "Live";
  }
  if (shouldMockAllSourceApis()) return "Mock";
  if (type === "META_ADS" && shouldMockMetaAdsApis()) return "Mock";
  return "Live";
}
