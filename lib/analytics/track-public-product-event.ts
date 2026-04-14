import type { ProductEventTypeValue } from "@/lib/analytics/product-event-types";

type PublicMarketingEvent = Extract<
  ProductEventTypeValue,
  "LANDING_VIEW" | "CTA_CLICK" | "PRICING_CTA_CLICK" | "SIGNUP_START" | "TRIAL_START"
>;

export function trackPublicProductEvent(
  eventType: PublicMarketingEvent,
  opts?: {
    path?: string;
    dedupeKey?: string;
    metadata?: Record<string, unknown>;
  },
): void {
  if (typeof window === "undefined") return;
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventType,
      path: opts?.path ?? window.location.pathname,
      dedupeKey: opts?.dedupeKey ?? "",
      metadata: opts?.metadata,
    }),
  }).catch(() => null);
}
