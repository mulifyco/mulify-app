import { AlertSeverity, LeadStage, ReportStatus, ReportType, WatchlistAlertType } from "@prisma/client";
import prisma from "@/lib/prisma";

export type SeedLaunchDemoResult = { ok: true; already: boolean } | { ok: false; error: string };

/**
 * Idempotent per-user launch kit: sample watchlist + alerts + pipeline leads + demo executive report.
 * Marks workspace `demoWorkspaceEnabled` when user has an active workspace.
 */
export async function seedLaunchDemoForUser(userId: string): Promise<SeedLaunchDemoResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { launchDemoSeededAt: true, activeWorkspaceId: true },
  });
  if (!user) return { ok: false, error: "User not found" };
  if (user.launchDemoSeededAt) {
    if (user.activeWorkspaceId) {
      await prisma.workspace
        .update({
          where: { id: user.activeWorkspaceId },
          data: { demoWorkspaceEnabled: true },
        })
        .catch(() => null);
    }
    return { ok: true, already: true };
  }

  const short = userId.replace(/[^a-z0-9]/gi, "").slice(0, 12) || "user";
  const reportId = `launch_demo_exec_${userId}`;

  try {
    await prisma.$transaction(async (tx) => {
      const wl = await tx.watchlist.create({
        data: {
          name: `Competitor pulse — sample (${short})`,
          description: "Launch demo watchlist with sample domains and alerts.",
        },
      });

      await tx.watchlistStore.createMany({
        data: [
          { watchlistId: wl.id, domain: "sample-brand-a.demo", label: "Sample Brand A" },
          { watchlistId: wl.id, domain: "sample-brand-b.demo", label: "Sample Brand B" },
          { watchlistId: wl.id, domain: "sample-brand-c.demo", label: "Sample Brand C" },
        ],
      });

      await tx.watchlistAlertLog.createMany({
        data: [
          {
            watchlistId: wl.id,
            type: WatchlistAlertType.STORE_TREND_SPIKE,
            title: "Spike: sample-brand-a.demo",
            message: "Demo alert — simulated trend motion on a tracked domain.",
            severity: AlertSeverity.WARNING,
          },
          {
            watchlistId: wl.id,
            type: WatchlistAlertType.READY_TO_SCALE_APPEARED,
            title: "New Ready-to-Scale signal",
            message: "Demo alert — a cluster crossed the RTS threshold in this watchlist.",
            severity: AlertSeverity.INFO,
          },
        ],
      });

      const d1 = `pipeline-sample-1-${short}.mulify.demo`;
      const d2 = `pipeline-sample-2-${short}.mulify.demo`;
      await tx.lead.upsert({
        where: { domain: d1 },
        create: {
          domain: d1,
          companyName: "Sample Lead — Discovery",
          leadStage: LeadStage.NEW,
          estimatedPotentialScore: 72,
          notes: "Demo CRM lead from launch kit.",
        },
        update: {},
      });
      await tx.lead.upsert({
        where: { domain: d2 },
        create: {
          domain: d2,
          companyName: "Sample Lead — In conversation",
          leadStage: LeadStage.CONTACTED,
          estimatedPotentialScore: 64,
          notes: "Demo CRM lead from launch kit.",
        },
        update: {},
      });

      await tx.report.upsert({
        where: { id: reportId },
        create: {
          id: reportId,
          title: "Executive summary (sample workspace)",
          type: ReportType.EXECUTIVE_SUMMARY,
          status: ReportStatus.READY,
          summary: {
            cards: [
              { label: "Narratives in view", value: "Beauty · Pets · Apparel" },
              { label: "Lead board signal", value: "Ready to Scale" },
              { label: "Watchlist motion", value: "3 demo domains" },
              { label: "Confidence", value: "High (sample)" },
            ],
            narrative:
              "This is a sample executive summary. Connect live sources and run a real report to replace these cards with workspace intelligence.",
            topItems: [],
          },
        },
        update: {
          title: "Executive summary (sample workspace)",
          status: ReportStatus.READY,
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { launchDemoSeededAt: new Date() },
      });

      if (user.activeWorkspaceId) {
        await tx.workspace.update({
          where: { id: user.activeWorkspaceId },
          data: { demoWorkspaceEnabled: true },
        });
      }
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Demo seed failed" };
  }

  return { ok: true, already: false };
}
