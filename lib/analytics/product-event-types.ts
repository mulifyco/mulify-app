/** Mirrors Prisma `ProductEventType` for API / client validation. */
export const PRODUCT_EVENT_TYPE_VALUES = [
  "LOGIN_SUCCESS",
  "DASHBOARD_VIEW",
  "BOARD_VIEW",
  "BOARD_ITEM_OPEN",
  "COMPARE_RUN",
  "REPORT_CREATE",
  "REPORT_EXPORT",
  "WATCHLIST_CREATE",
  "WATCHLIST_ALERT_OPEN",
  "LEAD_CREATE",
  "REVIEW_ITEM_RESOLVE",
  "PAYWALL_HIT",
  "BILLING_CHECKOUT_START",
  "BILLING_PORTAL_OPEN",
  "COPILOT_OPEN",
  "BRIEF_OPEN",
  "OFFER_ANALYZER_OPEN",
  "PERSONA_ANALYZER_OPEN",
  "AUTO_ACTION_RUN",
  "SOURCE_CREATED",
  "LANDING_VIEW",
  "CTA_CLICK",
  "DEMO_WORKSPACE_ENTER",
  "PRICING_CTA_CLICK",
  "SIGNUP_START",
  "TRIAL_START",
] as const;

export type ProductEventTypeValue = (typeof PRODUCT_EVENT_TYPE_VALUES)[number];

const SET = new Set<string>(PRODUCT_EVENT_TYPE_VALUES);

export function isProductEventType(v: string): v is ProductEventTypeValue {
  return SET.has(v);
}
