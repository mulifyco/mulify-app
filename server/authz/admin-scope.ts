import type { Session } from "next-auth";
import { DEMO_ADMIN_EMAIL } from "@/lib/auth";

function sessionEmail(session: Session | null): string | null {
  const email = session?.user?.email ?? null;
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
}

/**
 * Phase 1 "admin-only" guard.
 *
 * We restrict sensitive ops endpoints to the configured ADMIN_EMAIL (or demo admin),
 * regardless of workspace membership.
 */
export function isOpsAdmin(session: Session | null): boolean {
  const email = sessionEmail(session);
  if (!email) return false;
  const allowed = (process.env.ADMIN_EMAIL ?? DEMO_ADMIN_EMAIL).trim().toLowerCase();
  return email === allowed;
}

