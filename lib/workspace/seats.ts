/**
 * Workspace seat limits by billing tier (members + pending invites count toward capacity).
 * TEAM uses a generous cap (15+ seats in product terms).
 */
export function seatLimitForPlan(plan: string | null | undefined): number {
  const p = (plan ?? "").toUpperCase();
  if (p === "ENTERPRISE" || p === "TEAM") return 50;
  if (p === "PRO") return 3;
  return 1;
}
