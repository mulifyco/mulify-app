import type { GtmLead, GtmStage } from "@prisma/client";
import prisma from "@/lib/prisma";

const ACTIVITY_SPAM_WINDOW_MS = 2 * 60 * 1000;
const ACTIVITY_SPAM_MAX = 8;

function normEmail(e: string | null | undefined): string | null {
  const s = e?.trim().toLowerCase();
  return s && s.includes("@") ? s : null;
}

function normCompany(c: string): string {
  return c.trim();
}

export async function findGtmDuplicateCandidate(params: {
  email?: string | null;
  company: string;
}): Promise<{ id: string } | null> {
  const email = normEmail(params.email);
  const company = normCompany(params.company);
  if (!company) return null;

  if (email) {
    const byEmail = await prisma.gtmLead.findFirst({ where: { email }, select: { id: true } });
    if (byEmail) return byEmail;
  }
  return prisma.gtmLead.findFirst({
    where: { company: { equals: company, mode: "insensitive" } },
    select: { id: true },
  });
}

export type CreateGtmLeadInput = {
  name?: string | null;
  workspaceId: string;
  company: string;
  website?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  source: string;
  painPoint?: string | null;
  estimatedMRR?: number | null;
  stage?: GtmStage;
  priorityScore?: number | null;
  owner?: string | null;
  notes?: string | null;
  lastContactAt?: Date | null;
  nextFollowUpAt?: Date | null;
  crmLeadId?: string | null;
};

export async function createOrMergeGtmLead(input: CreateGtmLeadInput): Promise<{ id: string; merged: boolean }> {
  const company = normCompany(input.company);
  if (!company) throw new Error("company is required");

  const email = normEmail(input.email) ?? null;
  const dup = await prisma.gtmLead.findFirst({
    where: {
      workspaceId: input.workspaceId,
      OR: [
        ...(email ? [{ email }] : []),
        { company: { equals: company, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });

  if (dup) {
    const existing = await prisma.gtmLead.findUnique({ where: { id: dup.id } });
    if (!existing) throw new Error("GTM lead not found");

    const mergedNotes = [existing.notes, input.notes?.trim()].filter(Boolean).join("\n---\n") || existing.notes;

    const updated = await prisma.gtmLead.update({
      where: { id: dup.id },
      data: {
        name: input.name?.trim() || existing.name,
        company,
        website: input.website?.trim() || existing.website,
        email: email ?? existing.email,
        linkedinUrl: input.linkedinUrl?.trim() || existing.linkedinUrl,
        source: input.source || existing.source,
        painPoint: input.painPoint?.trim() ?? existing.painPoint,
        estimatedMRR:
          input.estimatedMRR != null
            ? Math.max(0, Math.round(input.estimatedMRR))
            : existing.estimatedMRR,
        stage: input.stage ?? existing.stage,
        priorityScore:
          input.priorityScore != null
            ? Math.max(0, Math.min(100, Math.round(input.priorityScore)))
            : existing.priorityScore,
        owner: input.owner?.trim() || existing.owner,
        notes: mergedNotes,
        lastContactAt: input.lastContactAt ?? existing.lastContactAt,
        nextFollowUpAt: input.nextFollowUpAt ?? existing.nextFollowUpAt,
        crmLeadId: input.crmLeadId ?? existing.crmLeadId,
      },
      select: { id: true },
    });
    return { id: updated.id, merged: true };
  }

  const created = await prisma.gtmLead.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name?.trim() || null,
      company,
      website: input.website?.trim() || null,
      email,
      linkedinUrl: input.linkedinUrl?.trim() || null,
      source: input.source,
      painPoint: input.painPoint?.trim() || "",
      estimatedMRR: input.estimatedMRR != null ? Math.max(0, Math.round(input.estimatedMRR)) : 0,
      stage: input.stage ?? "PROSPECT",
      priorityScore:
        input.priorityScore != null ? Math.max(0, Math.min(100, Math.round(input.priorityScore))) : 50,
      owner: input.owner?.trim() || null,
      notes: input.notes?.trim() || null,
      lastContactAt: input.lastContactAt ?? null,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
      crmLeadId: input.crmLeadId ?? null,
    },
    select: { id: true },
  });
  return { id: created.id, merged: false };
}

export async function recordGtmActivity(
  workspaceId: string,
  leadId: string,
  type: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = type.trim().slice(0, 80);
  const n = note.trim().slice(0, 8000);
  if (!t) return { ok: false, error: "type required" };

  const since = new Date(Date.now() - ACTIVITY_SPAM_WINDOW_MS);
  const recent = await prisma.gtmActivity.count({
    where: { workspaceId, leadId, createdAt: { gte: since } },
  });
  if (recent >= ACTIVITY_SPAM_MAX) {
    return { ok: false, error: "Too many activities in a short window for this lead." };
  }

  const dupNote = await prisma.gtmActivity.findFirst({
    where: { workspaceId, leadId, type: t, note: n, createdAt: { gte: since } },
    select: { id: true },
  });
  if (dupNote) return { ok: false, error: "Duplicate activity (throttled)." };

  await prisma.gtmActivity.create({
    data: { workspaceId, leadId, type: t, note: n },
  });

  await prisma.gtmLead.update({
    where: { id: leadId },
    data: { lastContactAt: new Date() },
  });

  return { ok: true };
}

export async function promoteCrmLeadToGtm(crmLeadId: string): Promise<{ id: string; merged: boolean }> {
  const lead = await prisma.lead.findUnique({ where: { id: crmLeadId } });
  if (!lead) throw new Error("CRM lead not found");
  if (!lead.workspaceId) throw new Error("CRM lead workspace missing");
  const workspaceId = lead.workspaceId;

  const existingGtm = await prisma.gtmLead.findFirst({ where: { crmLeadId, workspaceId } });
  if (existingGtm) return { id: existingGtm.id, merged: true };

  const company = lead.companyName?.trim() || lead.domain;
  const tags = (lead.tags ?? []).join(", ");
  const pain =
    lead.leadStage === "PARTNER"
      ? "Partner-worthy agency (from CRM)"
      : lead.leadStage === "ACQUISITION_TARGET"
        ? "Acquisition target (from CRM)"
        : lead.estimatedPotentialScore >= 70
          ? "High-score store lead (from CRM)"
          : "Product CRM lead";

  const res = await createOrMergeGtmLead({
    workspaceId,
    company,
    website: lead.domain ? `https://${lead.domain}` : null,
    email: lead.contactEmail,
    source: "product_crm",
    painPoint: pain,
    estimatedMRR: Math.round(lead.estimatedPotentialScore) * 10,
    priorityScore: lead.estimatedPotentialScore,
    notes: [lead.notes, tags ? `tags: ${tags}` : null].filter(Boolean).join("\n"),
    stage: "PROSPECT",
    crmLeadId: lead.id,
  });

  if (res.merged) {
    const row = await prisma.gtmLead.findUnique({ where: { id: res.id }, select: { crmLeadId: true } });
    if (row && !row.crmLeadId) {
      await prisma.gtmLead.update({ where: { id: res.id }, data: { crmLeadId } }).catch(() => null);
    }
  }

  return res;
}

const STAGES: GtmStage[] = [
  "PROSPECT",
  "CONTACTED",
  "DEMO_BOOKED",
  "DEMO_DONE",
  "TRIAL",
  "WON",
  "LOST",
  "FOLLOW_UP_LATER",
];

export async function listGtmLeadsByStage(): Promise<Record<GtmStage, GtmLead[]>> {
  throw new Error("workspaceId required");
}

export async function listGtmLeadsByStageForWorkspace(workspaceId: string): Promise<Record<GtmStage, GtmLead[]>> {
  const rows = await prisma.gtmLead.findMany({
    where: { workspaceId },
    orderBy: [{ priorityScore: "desc" }, { updatedAt: "desc" }],
  });
  const out = {} as Record<GtmStage, GtmLead[]>;
  for (const s of STAGES) out[s] = [];
  for (const r of rows) {
    out[r.stage].push(r);
  }
  return out;
}

export type GtmDashboardStats = {
  outreachSent7d: number;
  demosBooked: number;
  demosDone: number;
  trialsActive: number;
  wonCount: number;
  pipelineMRR: number;
  wonMRR: number;
  followUpsToday: number;
  overdueFollowUps: number;
  demosThisWeek: number;
  hotProspects: GtmLead[];
  trialWatch: GtmLead[];
  payingUsersApprox: number;
};

export async function getGtmDashboardStats(): Promise<GtmDashboardStats> {
  throw new Error("workspaceId required");
}

export async function getGtmDashboardStatsForWorkspace(workspaceId: string): Promise<GtmDashboardStats> {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const [
    outreachSent7d,
    demosBooked,
    demosDone,
    trialsActive,
    wonCount,
    pipelineAgg,
    wonAgg,
    followUpsToday,
    overdueFollowUps,
    demosThisWeek,
    hotProspects,
    trialWatch,
    payingUsers,
  ] = await Promise.all([
    prisma.gtmActivity.count({
      where: { workspaceId, type: "OUTREACH_SENT", createdAt: { gte: d7 } },
    }),
    prisma.gtmLead.count({ where: { workspaceId, stage: "DEMO_BOOKED" } }),
    prisma.gtmLead.count({ where: { workspaceId, stage: "DEMO_DONE" } }),
    prisma.gtmLead.count({ where: { workspaceId, stage: "TRIAL" } }),
    prisma.gtmLead.count({ where: { workspaceId, stage: "WON" } }),
    prisma.gtmLead.aggregate({
      where: { workspaceId, stage: { notIn: ["LOST"] } },
      _sum: { estimatedMRR: true },
    }),
    prisma.gtmLead.aggregate({
      where: { workspaceId, stage: "WON" },
      _sum: { estimatedMRR: true },
    }),
    prisma.gtmLead.count({
      where: {
        workspaceId,
        nextFollowUpAt: { gte: startOfDay, lte: endOfDay },
        stage: { notIn: ["WON", "LOST"] },
      },
    }),
    prisma.gtmLead.count({
      where: {
        workspaceId,
        nextFollowUpAt: { lt: startOfDay },
        stage: { notIn: ["WON", "LOST"] },
      },
    }),
    prisma.gtmLead.count({
      where: {
        workspaceId,
        OR: [{ stage: "DEMO_BOOKED" }, { stage: "DEMO_DONE" }],
        updatedAt: { gte: startOfWeek },
      },
    }),
    prisma.gtmLead.findMany({
      where: { workspaceId, priorityScore: { gte: 75 }, stage: { notIn: ["WON", "LOST"] } },
      orderBy: { priorityScore: "desc" },
      take: 8,
    }),
    prisma.gtmLead.findMany({
      where: { workspaceId, stage: "TRIAL" },
      orderBy: [{ nextFollowUpAt: "asc" }, { updatedAt: "desc" }],
      take: 12,
    }),
    prisma.user.count({
      where: { billingPlan: { in: ["PRO", "TEAM"] } },
    }),
  ]);

  return {
    outreachSent7d,
    demosBooked,
    demosDone,
    trialsActive,
    wonCount,
    pipelineMRR: pipelineAgg._sum.estimatedMRR ?? 0,
    wonMRR: wonAgg._sum.estimatedMRR ?? 0,
    followUpsToday,
    overdueFollowUps,
    demosThisWeek,
    hotProspects,
    trialWatch,
    payingUsersApprox: payingUsers,
  };
}

export function inboundDemoNextFollowUp(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

export async function createInboundDemoLead(input: {
  workspaceId: string;
  company: string;
  name?: string | null;
  email?: string | null;
  website?: string | null;
  message?: string | null;
}): Promise<{ id: string; merged: boolean }> {
  const next = inboundDemoNextFollowUp();
  const res = await createOrMergeGtmLead({
    workspaceId: input.workspaceId,
    company: input.company,
    name: input.name,
    email: input.email,
    website: input.website,
    source: "inbound_demo",
    stage: "DEMO_BOOKED",
    nextFollowUpAt: next,
    painPoint: "Inbound demo request",
    notes: input.message?.trim() || null,
    priorityScore: 80,
  });

  await prisma.gtmLead.update({
    where: { id: res.id },
    data: { stage: "DEMO_BOOKED", nextFollowUpAt: next, lastContactAt: new Date() },
  });

  await prisma.gtmActivity.create({
    data: {
      workspaceId: input.workspaceId,
      leadId: res.id,
      type: "DEMO_BOOKED_INBOUND",
      note: input.message?.trim() || "Website book-demo form",
    },
  });
  return res;
}
