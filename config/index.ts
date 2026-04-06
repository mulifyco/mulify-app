// Mulify Library — Application Configuration
// All config read from environment variables with validation

import { z } from "zod";

/** Offline fixtures for Meta + Shopify ingestion (no external HTTP). */
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // App
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),

  // Internal admin auth (simple password-based for Phase 1)
  ADMIN_EMAIL: z.string().email().default("admin@mulify.co"),
  ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD must be at least 12 characters"),

  // Meta Ad Library API
  // Note: Meta Ad Library API requires app review and access token
  // Access is limited — not all fields are available without special permissions
  META_ACCESS_TOKEN: z.string().optional(),
  META_API_VERSION: z.string().default("v19.0"),
  META_AD_LIBRARY_BASE_URL: z.string().default("https://graph.facebook.com"),

  // Shopify — no auth needed for public storefront JSON API
  // These are the comma-separated target domains to crawl
  SHOPIFY_TARGET_DOMAINS: z.string().optional(),

  // Job runner
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(2),
  JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(300000), // 5 minutes

  // Rate limits
  META_REQUESTS_PER_HOUR: z.coerce.number().int().positive().default(200),
  SHOPIFY_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(30),

  // Environment
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * When true, Meta + Shopify adapters use in-process fixtures instead of calling external APIs.
   * Recommended for local UI/testing without API keys or public store endpoints.
   */
  LIBRARY_MOCK_SOURCE_APIS: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return false;
      const s = v.trim().toLowerCase();
      return s === "true" || s === "1" || s === "yes";
    }),
});

// Validate on startup — fail fast if misconfigured
function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((e: any) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${missing}`);
  }

  return parsed.data;
}

// Lazy singleton — only parse once
let _config: ReturnType<typeof loadConfig> | null = null;

export function getConfig() {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

export function getMetaConfig() {
  const config = getConfig();
  return {
    accessToken: config.META_ACCESS_TOKEN,
    apiVersion: config.META_API_VERSION,
    baseUrl: config.META_AD_LIBRARY_BASE_URL,
    requestsPerHour: config.META_REQUESTS_PER_HOUR,
  };
}

export function getShopifyConfig() {
  const config = getConfig();
  const domains = config.SHOPIFY_TARGET_DOMAINS
    ? config.SHOPIFY_TARGET_DOMAINS.split(",").map((d) => d.trim()).filter(Boolean)
    : [];
  return {
    targetDomains: domains,
    requestsPerMinute: config.SHOPIFY_REQUESTS_PER_MINUTE,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

/** Force mock payloads for both Meta and Shopify (explicit opt-in). */
export function shouldMockAllSourceApis(): boolean {
  return getConfig().LIBRARY_MOCK_SOURCE_APIS === true;
}

/**
 * Meta: mock when explicitly requested, or in development when no access token is set.
 * Shopify: mock only when LIBRARY_MOCK_SOURCE_APIS=true (public API has no “token”).
 */
export function shouldMockMetaAdsApis(): boolean {
  if (shouldMockAllSourceApis()) return true;
  if (process.env.NODE_ENV !== "production" && !process.env.META_ACCESS_TOKEN?.trim()) {
    return true;
  }
  return false;
}

