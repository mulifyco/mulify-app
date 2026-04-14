/**
 * Pricing / upgrade intent (works logged-in or logged-out; attaches user when session exists).
 */
export function trackPricingCtaClick(ctaId: string, extra?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const body: Record<string, unknown> = {
    eventType: "PRICING_CTA_CLICK",
    path: "/pricing",
    dedupeKey: ctaId,
    metadata: { ctaId, ...extra },
  };
  void fetch("/api/analytics/event", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
}

export function trackTrialIntentFromPricing(plan: "PRO" | "TEAM"): void {
  if (typeof window === "undefined") return;
  void fetch("/api/analytics/event", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventType: "TRIAL_START",
      path: "/pricing",
      dedupeKey: `trial_${plan}`,
      metadata: { plan, surface: "pricing_checkout" },
    }),
  }).catch(() => null);
}
