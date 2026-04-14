import { getBranding } from "@/lib/branding/config";

export type ReadinessLevel = "green" | "yellow" | "red";

export type EnvCheck = {
  key: string;
  level: ReadinessLevel;
  message: string;
  valueHint?: string;
};

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

function has(v: string | undefined | null, minLen = 1): boolean {
  return typeof v === "string" && v.trim().length >= minLen;
}

function asBool(v: string | undefined | null): boolean {
  return String(v ?? "").trim().toLowerCase() === "true";
}

export function getEnvChecks(): EnvCheck[] {
  const brand = getBranding();

  const checks: EnvCheck[] = [];

  // Core
  checks.push({
    key: "DATABASE_URL",
    level: has(process.env.DATABASE_URL) ? "green" : "red",
    message: has(process.env.DATABASE_URL) ? "Database configured." : "Missing DATABASE_URL.",
  });

  // Auth (Auth.js v5)
  const authSecret = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "";
  checks.push({
    key: "AUTH_SECRET/NEXTAUTH_SECRET",
    level: authSecret.length >= 32 ? "green" : isProd() ? "red" : "yellow",
    message:
      authSecret.length >= 32
        ? "Session encryption secret configured."
        : isProd()
          ? "Missing/weak AUTH_SECRET (>= 32 chars) in production."
          : "Dev secret fallback will be used.",
  });
  checks.push({
    key: "NEXTAUTH_URL",
    level: has(process.env.NEXTAUTH_URL) ? "green" : isProd() ? "red" : "yellow",
    message: has(process.env.NEXTAUTH_URL)
      ? "Auth base URL configured."
      : isProd()
        ? "Missing NEXTAUTH_URL in production."
        : "Dev fallback will be used.",
  });

  // Admin seed credentials
  checks.push({
    key: "ADMIN_EMAIL",
    level: has(process.env.ADMIN_EMAIL) ? "green" : isProd() ? "red" : "yellow",
    message: has(process.env.ADMIN_EMAIL)
      ? "Admin email configured."
      : isProd()
        ? "Missing ADMIN_EMAIL in production."
        : "Dev fallback will be used.",
  });
  checks.push({
    key: "ADMIN_PASSWORD",
    level: has(process.env.ADMIN_PASSWORD, 12) ? "green" : isProd() ? "red" : "yellow",
    message: has(process.env.ADMIN_PASSWORD, 12)
      ? "Admin password configured."
      : isProd()
        ? "Missing/weak ADMIN_PASSWORD (>= 12 chars) in production."
        : "Dev fallback will be used.",
  });

  // Billing (Stripe)
  const stripeEnabled = has(process.env.STRIPE_SECRET_KEY) || has(process.env.STRIPE_WEBHOOK_SECRET);
  checks.push({
    key: "STRIPE_SECRET_KEY",
    level: has(process.env.STRIPE_SECRET_KEY) ? "green" : stripeEnabled && isProd() ? "red" : "yellow",
    message: has(process.env.STRIPE_SECRET_KEY)
      ? "Stripe server key configured."
      : stripeEnabled && isProd()
        ? "Stripe appears enabled but STRIPE_SECRET_KEY is missing."
        : "Stripe not configured (billing features may be limited).",
  });
  checks.push({
    key: "STRIPE_WEBHOOK_SECRET",
    level: has(process.env.STRIPE_WEBHOOK_SECRET) ? "green" : stripeEnabled && isProd() ? "red" : "yellow",
    message: has(process.env.STRIPE_WEBHOOK_SECRET)
      ? "Stripe webhook secret configured."
      : stripeEnabled && isProd()
        ? "Stripe appears enabled but STRIPE_WEBHOOK_SECRET is missing."
        : "Webhook secret not configured.",
  });

  // Support / trust
  checks.push({
    key: "NEXT_PUBLIC_SUPPORT_EMAIL",
    level: has(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) ? "green" : "yellow",
    message: has(process.env.NEXT_PUBLIC_SUPPORT_EMAIL)
      ? `Support email set (${brand.supportEmail}).`
      : `Using default support email (${brand.supportEmail}).`,
  });

  // Worker
  checks.push({
    key: "WORKER_INTERVAL_MS",
    level: has(process.env.WORKER_INTERVAL_MS) ? "green" : "yellow",
    message: has(process.env.WORKER_INTERVAL_MS) ? "Worker interval configured." : "Using default worker interval.",
  });
  checks.push({
    key: "WORKER_ENABLE_ADS_FALLBACK",
    level: asBool(process.env.WORKER_ENABLE_ADS_FALLBACK) ? "yellow" : "green",
    message: asBool(process.env.WORKER_ENABLE_ADS_FALLBACK)
      ? "Ads fallback worker enabled (higher load)."
      : "Ads fallback worker disabled.",
  });

  return checks;
}

export function assertProdEnvOrThrow(): void {
  if (!isProd()) return;
  const checks = getEnvChecks();
  const reds = checks.filter((c) => c.level === "red");
  if (!reds.length) return;
  const msg = reds.map((c) => `${c.key}: ${c.message}`).join(" | ");
  throw new Error(`Env not ready for production: ${msg}`);
}

