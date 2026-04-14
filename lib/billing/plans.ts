export type PlanId = "FREE" | "PRO" | "TEAM";

export type FeatureId =
  | "BOARDS"
  | "CREATIVE_WINNERS"
  | "COMPARE"
  | "WATCHLISTS"
  | "ALERTS"
  | "REPORTS"
  | "PDF_EXPORT"
  | "OPS"
  | "REVIEW_QUEUE"
  | "SAVED_FILTERS";

export type PlanDefinition = {
  id: PlanId;
  label: string;
  tagline: string;
  monthlyCredits: number;
  features: Record<FeatureId, boolean>;
  limits: {
    maxReportsPerMonth: number;
    maxCompareDomains: number;
    maxWatchlists: number;
    maxSavedFilters: number;
  };
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  FREE: {
    id: "FREE",
    label: "Free",
    tagline: "Explore signals with light limits.",
    monthlyCredits: 50,
    features: {
      BOARDS: true,
      CREATIVE_WINNERS: false,
      COMPARE: false,
      WATCHLISTS: true,
      ALERTS: false,
      REPORTS: false,
      PDF_EXPORT: false,
      OPS: false,
      REVIEW_QUEUE: false,
      SAVED_FILTERS: false,
    },
    limits: {
      maxReportsPerMonth: 0,
      maxCompareDomains: 0,
      maxWatchlists: 1,
      maxSavedFilters: 0,
    },
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    tagline: "Operate weekly intelligence workflows.",
    monthlyCredits: 500,
    features: {
      BOARDS: true,
      CREATIVE_WINNERS: true,
      COMPARE: true,
      WATCHLISTS: true,
      ALERTS: true,
      REPORTS: true,
      PDF_EXPORT: true,
      OPS: true,
      REVIEW_QUEUE: true,
      SAVED_FILTERS: true,
    },
    limits: {
      maxReportsPerMonth: 60,
      maxCompareDomains: 20,
      maxWatchlists: 25,
      maxSavedFilters: 50,
    },
  },
  TEAM: {
    id: "TEAM",
    label: "Team",
    tagline: "Scale monitoring, reporting, and ops.",
    monthlyCredits: 2000,
    features: {
      BOARDS: true,
      CREATIVE_WINNERS: true,
      COMPARE: true,
      WATCHLISTS: true,
      ALERTS: true,
      REPORTS: true,
      PDF_EXPORT: true,
      OPS: true,
      REVIEW_QUEUE: true,
      SAVED_FILTERS: true,
    },
    limits: {
      maxReportsPerMonth: 500,
      maxCompareDomains: 25,
      maxWatchlists: 250,
      maxSavedFilters: 250,
    },
  },
};

export function defaultPlanFromEnv(): PlanId {
  const raw = (process.env.NEXT_PUBLIC_DEFAULT_PLAN ?? "").toUpperCase().trim();
  if (raw === "FREE" || raw === "PRO" || raw === "TEAM") return raw;
  // safest dev default: PRO (doesn't break internal console)
  return "PRO";
}

