/**
 * Loaded from `next.config.ts` so it runs before the app bundles.
 * Supplies safe defaults only when NODE_ENV !== "production".
 */

if (process.env.NODE_ENV !== "production") {
  // Auth.js v5 reads AUTH_SECRET before NEXTAUTH_SECRET. Keep them identical in dev
  // so JWT encrypt/decrypt always uses one key (avoids JWTSessionError after env edits).
  const pickDevAuthSecret = (): string => {
    const a = process.env.AUTH_SECRET?.trim() ?? "";
    const n = process.env.NEXTAUTH_SECRET?.trim() ?? "";
    if (a.length >= 32) return a;
    if (n.length >= 32) return n;
    return "local-development-nextauth-secret-key-32-min!";
  };
  const devSecret = pickDevAuthSecret();
  process.env.AUTH_SECRET = devSecret;
  process.env.NEXTAUTH_SECRET = devSecret;
  if (!process.env.ADMIN_PASSWORD?.trim() || process.env.ADMIN_PASSWORD.length < 12) {
    process.env.ADMIN_PASSWORD = "localdev-password-change-me";
  }
  if (!process.env.NEXTAUTH_URL?.trim()) {
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  }
  if (!process.env.ADMIN_EMAIL?.trim()) {
    process.env.ADMIN_EMAIL = "admin@mulify.co";
  }
}
