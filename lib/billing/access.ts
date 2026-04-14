import type { FeatureId, PlanDefinition, PlanId } from "@/lib/billing/plans";
import { PLANS, defaultPlanFromEnv } from "@/lib/billing/plans";

function getNestedString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const v = (obj as Record<string, unknown>)[key];
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
}

export function getUserPlan(session: unknown): PlanId {
  const user = session && typeof session === "object" ? (session as Record<string, unknown>).user : null;
  const plan = getNestedString(user, "plan")?.toUpperCase() ?? null;
  if (plan === "FREE" || plan === "PRO" || plan === "TEAM") return plan;

  // Admin/internal role fallback to PRO unless overridden.
  const role = getNestedString(user, "role")?.toLowerCase() ?? "";
  if (role === "admin") return defaultPlanFromEnv();

  return defaultPlanFromEnv();
}

export function getPlanDefinition(plan: PlanId): PlanDefinition {
  return PLANS[plan];
}

export function canAccessFeature(plan: PlanId, feature: FeatureId): boolean {
  return Boolean(PLANS[plan]?.features?.[feature]);
}

export function getPlanLimits(plan: PlanId) {
  return PLANS[plan].limits;
}

// Phase 1 placeholder for credit accounting. Future: persist usage to DB.
export function getRemainingCredits(plan: PlanId, opts?: { usedThisMonth?: number }) {
  const monthlyCredits = PLANS[plan].monthlyCredits;
  const used = Math.max(0, opts?.usedThisMonth ?? 0);
  const remaining = Math.max(0, monthlyCredits - used);
  return {
    monthlyCredits,
    used,
    remaining,
    isEnforced: false, // phase 1: no DB-backed enforcement yet
  };
}

export function paywallResponse(feature: FeatureId, plan: PlanId) {
  return {
    error: "Upgrade required",
    code: "PAYWALL",
    feature,
    plan,
    upgradeUrl: "/pricing",
  };
}

