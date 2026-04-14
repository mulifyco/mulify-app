import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";

/** GTM cockpit uses same gate as Ops / internal analytics. */
export async function requireGtmSession(): Promise<Session | null> {
  const session = await auth();
  if (!session?.user) return null;
  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "OPS")) return null;
  return session;
}
