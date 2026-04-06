/**
 * Loaded from `next.config.ts` so it runs before the app bundles.
 * Supplies safe defaults only when NODE_ENV !== "production".
 */

if (process.env.NODE_ENV !== "production") {
  if (!process.env.NEXTAUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET.length < 32) {
    process.env.NEXTAUTH_SECRET = "local-development-nextauth-secret-key-32-min!";
  }
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
