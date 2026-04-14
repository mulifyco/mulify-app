import Stripe from "stripe";

export type StripePlan = "FREE" | "PRO" | "TEAM";

export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

export function priceIdForPlan(plan: StripePlan): string | null {
  if (plan === "FREE") return process.env.STRIPE_PRICE_FREE ?? null;
  if (plan === "PRO") return process.env.STRIPE_PRICE_PRO ?? null;
  if (plan === "TEAM") return process.env.STRIPE_PRICE_TEAM ?? null;
  return null;
}

export function planForPriceId(priceId: string): StripePlan | null {
  const m: Array<[StripePlan, string | undefined]> = [
    ["FREE", process.env.STRIPE_PRICE_FREE],
    ["PRO", process.env.STRIPE_PRICE_PRO],
    ["TEAM", process.env.STRIPE_PRICE_TEAM],
  ];
  for (const [p, id] of m) {
    if (id && id === priceId) return p;
  }
  return null;
}

