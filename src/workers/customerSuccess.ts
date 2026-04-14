import prisma from "@/src/lib/prisma";
import { ensureWeeklyDigest, generateCustomerNudges, upsertCustomerHealthSnapshot } from "@/server/services/customer-success.service";

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

export async function customerSuccessJob(): Promise<{
  usersConsidered: number;
  snapshotsCreated: number;
  digestsEnsured: number;
  nudgesCreated: number;
  skippedNoWorkspace: number;
}> {
  const maxPerTick = Number.parseInt(process.env.CUSTOMER_SUCCESS_MAX_PER_TICK ?? "10", 10) || 10;
  const minSnapshotHours = Number.parseInt(process.env.CUSTOMER_SUCCESS_MIN_SNAPSHOT_HOURS ?? "12", 10) || 12;

  const users = await prisma.user.findMany({
    where: { activeWorkspaceId: { not: null } },
    select: { id: true, activeWorkspaceId: true },
    take: Math.max(1, Math.min(50, maxPerTick)),
    orderBy: { updatedAt: "desc" },
  });

  let snapshotsCreated = 0;
  let digestsEnsured = 0;
  let nudgesCreated = 0;
  let skippedNoWorkspace = 0;

  for (const u of users) {
    const workspaceId = u.activeWorkspaceId;
    if (!workspaceId) {
      skippedNoWorkspace += 1;
      continue;
    }

    const recentSnapshot = await prisma.customerHealthSnapshot.findFirst({
      where: { userId: u.id, workspaceId, createdAt: { gte: hoursAgo(minSnapshotHours) } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    if (!recentSnapshot) {
      await upsertCustomerHealthSnapshot({ userId: u.id, workspaceId }).catch(() => null);
      snapshotsCreated += 1;
    }

    await ensureWeeklyDigest({ userId: u.id, workspaceId }).catch(() => null);
    digestsEnsured += 1;

    const nudges = await generateCustomerNudges({ userId: u.id, workspaceId }).catch(() => ({ created: 0 }));
    nudgesCreated += nudges.created ?? 0;
  }

  return {
    usersConsidered: users.length,
    snapshotsCreated,
    digestsEnsured,
    nudgesCreated,
    skippedNoWorkspace,
  };
}

