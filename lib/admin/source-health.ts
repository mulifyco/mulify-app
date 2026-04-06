import type { Prisma } from "@prisma/client";

export type SourceHealthUi = "healthy" | "idle" | "paused" | "attention" | "degraded";

export function sourceHealthUi(source: {
  status: string;
  errorCount: number;
  lastError: string | null;
  lastSyncAt: Date | null;
}): SourceHealthUi {
  if (source.status === "ERROR" || source.errorCount > 2) return "degraded";
  if (source.status === "PAUSED") return "paused";
  if (source.lastError && source.errorCount > 0) return "attention";
  if (source.status === "ACTIVE" && source.lastSyncAt) return "healthy";
  return "idle";
}

export function sourceHealthBadge(source: {
  status: string;
  errorCount: number;
  lastError: string | null;
  lastSyncAt: Date | null;
}): { label: string; variant: "green" | "yellow" | "red" | "default" } {
  const ui = sourceHealthUi(source);
  const map: Record<SourceHealthUi, { label: string; variant: "green" | "yellow" | "red" | "default" }> = {
    healthy: { label: "Healthy", variant: "green" },
    idle: { label: "Idle", variant: "default" },
    paused: { label: "Paused", variant: "yellow" },
    attention: { label: "Attention", variant: "yellow" },
    degraded: { label: "Degraded", variant: "red" },
  };
  return map[ui];
}

/** URL filter → Prisma where fragment (AND with other list filters). */
export function sourceHealthPrismaWhere(
  health: string | undefined
): Prisma.SourceWhereInput | undefined {
  if (!health || health === "all") return undefined;
  switch (health) {
    case "healthy":
      return {
        status: "ACTIVE",
        errorCount: 0,
        lastError: null,
        lastSyncAt: { not: null },
      };
    case "idle":
      return {
        OR: [{ status: "PENDING" }, { status: "ACTIVE", lastSyncAt: null }],
      };
    case "paused":
      return { status: "PAUSED" };
    case "degraded":
      return {
        OR: [{ status: "ERROR" }, { errorCount: { gt: 2 } }],
      };
    case "attention":
      return {
        NOT: { status: "PAUSED" },
        OR: [{ lastError: { not: null } }, { errorCount: { gt: 0, lte: 2 } }],
      };
    default:
      return undefined;
  }
}
