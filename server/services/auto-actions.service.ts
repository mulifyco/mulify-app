import prisma from "@/lib/prisma";
import { watchlistDb } from "@/lib/prisma-watchlist-delegate";
import { WatchlistRepository } from "@/server/repositories/watchlist.repository";
import { generateReportSummary, type CreateReportInput } from "@/server/services/report.service";
import { openReviewQueueItem } from "@/server/services/review-queue.service";
import { SourceRepository } from "@/server/repositories/source.repository";
import { createOrMergeGtmLead, findGtmDuplicateCandidate, recordGtmActivity } from "@/server/services/gtm.service";

export type AutoEntityType =
  | "PRODUCT_CLUSTER"
  | "CREATIVE_CLUSTER"
  | "STORE"
  | "WATCHLIST_ALERT"
  | "DISCOVERY_CANDIDATE"
  | "PRODUCT"
  | "LANDING_PAGE";

export type AutoActionType =
  | "ADD_TO_WATCHLIST"
  | "OPEN_COMPARE"
  | "CREATE_REPORT"
  | "OPEN_REVIEW"
  | "PROMOTE_SOURCE"
  | "OPEN_ADS"
  | "OPEN_PRODUCTS"
  | "CREATE_SOURCE"
  | "OPEN_CAMPAIGN_BRIEF"
  | "OPEN_OFFER_ANALYZER"
  | "OPEN_PERSONA_ANALYZER"
  | "CREATE_LEAD"
  | "OPEN_LEAD"
  | "CREATE_GTM_LEAD"
  | "OPEN_GTM"
  | "SCHEDULE_FOLLOW_UP";

export type AutoActionResult = {
  ok: boolean;
  redirectUrl?: string;
  createdId?: string;
  message: string;
};

function minutesAgo(m: number): Date {
  return new Date(Date.now() - m * 60 * 1000);
}

async function ensureDefaultWatchlist(workspaceId: string): Promise<{ id: string; name: string }> {
  const existing = (await watchlistDb().findFirst({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  })) as { id: string; name: string } | null;
  if (existing) return existing;
  const created = await WatchlistRepository.create({
    workspaceId,
    name: "Auto Watchlist",
    description: "Created automatically for one-click actions.",
  });
  return { id: created.id, name: created.name };
}

async function resolveDomainFromProductCluster(clusterId: string): Promise<string | null> {
  const m = await prisma.productClusterMember.findFirst({
    where: { clusterId },
    select: { product: { select: { store: { select: { domain: true } } } } },
  });
  return m?.product?.store?.domain ?? null;
}

async function resolveDomainFromCreativeCluster(clusterId: string): Promise<string | null> {
  const member = await prisma.creativeClusterMember.findFirst({
    where: { clusterId },
    select: { shopId: true },
  });
  if (!member?.shopId) return null;
  const shop = await prisma.shop.findUnique({ where: { id: member.shopId }, select: { domain: true } });
  return shop?.domain ?? null;
}

async function resolveDomainFromStore(storeId: string): Promise<string | null> {
  const s = await prisma.store.findUnique({ where: { id: storeId }, select: { domain: true } });
  return s?.domain ?? null;
}

async function upsertLeadByDomain(params: {
  domain: string;
  storeId?: string | null;
  tags?: string[];
  notes?: string | null;
}): Promise<{ id: string }> {
  const domain = params.domain.trim();
  const tags = params.tags ?? [];
  const existing = await prisma.lead.findUnique({ where: { domain }, select: { id: true, tags: true } }).catch(() => null);
  if (existing) {
    const mergedTags = [...new Set([...(existing.tags ?? []), ...tags])];
    const updated = await prisma.lead.update({
      where: { id: existing.id },
      data: { storeId: params.storeId ?? undefined, tags: mergedTags, notes: params.notes ?? undefined },
      select: { id: true },
    });
    return updated;
  }
  const created = await prisma.lead.create({
    data: {
      domain,
      storeId: params.storeId ?? null,
      estimatedPotentialScore: 0,
      leadStage: "NEW",
      tags,
      notes: params.notes ?? null,
    } as any,
    select: { id: true },
  });
  return created;
}

function domainsFromDelta(delta: unknown): string[] {
  if (!delta || typeof delta !== "object") return [];
  const obj = delta as Record<string, unknown>;
  const candidates: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.includes(".")) candidates.push(v);
  };
  for (const k of ["domain", "domains", "affectedDomains", "storeDomains"]) {
    const v = obj[k];
    if (Array.isArray(v)) for (const x of v) push(x);
    else push(v);
  }
  return [...new Set(candidates.map((d) => d.trim()).filter(Boolean))].slice(0, 20);
}

async function resolveDomainForLeadLike(
  entityType: AutoEntityType,
  entityId: string,
  context: Record<string, unknown>,
): Promise<string | null> {
  let domain: string | null = null;
  if (typeof context.domain === "string") domain = context.domain.trim();
  if (!domain && entityType === "STORE") domain = await resolveDomainFromStore(entityId);
  if (!domain && entityType === "PRODUCT_CLUSTER") domain = await resolveDomainFromProductCluster(entityId);
  if (!domain && entityType === "CREATIVE_CLUSTER") domain = await resolveDomainFromCreativeCluster(entityId);
  if (!domain && entityType === "WATCHLIST_ALERT") {
    const domains = await resolveDomainsForWatchlistAlert(entityId);
    domain = domains[0] ?? null;
  }
  return domain && domain.includes(".") ? domain : null;
}

async function resolveGtmLeadId(
  entityType: AutoEntityType,
  entityId: string,
  context: Record<string, unknown>,
): Promise<string | null> {
  if (typeof context.gtmLeadId === "string" && context.gtmLeadId.trim()) return context.gtmLeadId.trim();

  const domain = await resolveDomainForLeadLike(entityType, entityId, context);
  if (!domain) return null;

  const crm = await prisma.lead.findUnique({ where: { domain }, select: { id: true } }).catch(() => null);
  if (crm) {
    const linked = await prisma.gtmLead.findUnique({ where: { crmLeadId: crm.id }, select: { id: true } }).catch(() => null);
    if (linked) return linked.id;
  }

  const byCompany = await findGtmDuplicateCandidate({ email: null, company: domain });
  return byCompany?.id ?? null;
}

async function resolveDomainsForWatchlistAlert(alertId: string): Promise<string[]> {
  const a = await prisma.watchlistAlertLog.findUnique({
    where: { id: alertId },
    select: { delta: true, watchlistId: true },
  });
  const fromDelta = domainsFromDelta(a?.delta);
  if (fromDelta.length) return fromDelta;

  // fallback: use domains in watchlist
  if (!a?.watchlistId) return [];
  const wl = (await watchlistDb().findUnique({
    where: { id: a.watchlistId },
    select: { stores: { select: { domain: true }, take: 10 } },
  })) as { stores?: Array<{ domain: string }> } | null;
  const ds = (wl?.stores ?? []).map((s) => s.domain).filter(Boolean);
  return [...new Set(ds)].slice(0, 10);
}

function inferBoardTypeForCluster(c: {
  readyToScaleScore: number;
  earlyMoverScore: number;
  marketLeaderScore: number;
  saturatedScore: number;
}): "READY_TO_SCALE" | "EARLY_MOVERS" | "MARKET_LEADERS" | "SATURATED_PRODUCTS" {
  const rts = Number(c.readyToScaleScore ?? 0);
  const em = Number(c.earlyMoverScore ?? 0);
  const ml = Number(c.marketLeaderScore ?? 0);
  const sat = Number(c.saturatedScore ?? 0);
  if (rts >= em && rts >= ml && rts >= sat) return "READY_TO_SCALE";
  if (em >= ml && em >= sat) return "EARLY_MOVERS";
  if (ml >= sat) return "MARKET_LEADERS";
  return "SATURATED_PRODUCTS";
}

async function dedupeRecentReport(key: string): Promise<string | null> {
  const row = await prisma.report.findFirst({
    where: { createdAt: { gte: minutesAgo(15) }, title: { startsWith: `AutoAction:${key}` } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function createReportForEntity(entityType: AutoEntityType, entityId: string, ctx?: Record<string, unknown>): Promise<AutoActionResult> {
  const key = `${entityType}:${entityId}:CREATE_REPORT`;
  const existing = await dedupeRecentReport(key);
  if (existing) return { ok: true, createdId: existing, redirectUrl: `/reports/${existing}`, message: "Recent report already exists." };

  let input: CreateReportInput | null = null;
  if (entityType === "PRODUCT_CLUSTER") {
    const c = await prisma.productCluster.findUnique({
      where: { id: entityId },
      select: { readyToScaleScore: true, earlyMoverScore: true, marketLeaderScore: true, saturatedScore: true },
    });
    if (!c) return { ok: false, message: "Cluster not found." };
    const boardType = inferBoardTypeForCluster({
      readyToScaleScore: c.readyToScaleScore,
      earlyMoverScore: c.earlyMoverScore,
      marketLeaderScore: c.marketLeaderScore,
      saturatedScore: c.saturatedScore,
    });
    input = { type: "BOARD_SNAPSHOT", context: { boardType, take: 50, minScore: 0 } };
  } else if (entityType === "CREATIVE_CLUSTER") {
    input = { type: "BOARD_SNAPSHOT", context: { boardType: "CREATIVE_WINNERS", take: 50, minScore: 0 } };
  } else if (entityType === "STORE") {
    const domain = await resolveDomainFromStore(entityId);
    if (!domain) return { ok: false, message: "No domain found for store." };
    input = { type: "COMPARE_SNAPSHOT", context: { domains: [domain] } };
  } else if (entityType === "WATCHLIST_ALERT") {
    const domains = await resolveDomainsForWatchlistAlert(entityId);
    if (!domains.length) return { ok: false, message: "No impacted domains found for alert." };
    input = { type: "COMPARE_SNAPSHOT", context: { domains } };
  } else {
    return { ok: false, message: "Report not supported for this entity." };
  }

  const summaryPack = await generateReportSummary(input).catch(() => null);
  if (!summaryPack) return { ok: false, message: "Report creation failed." };

  const row = await prisma.report
    .create({
      data: {
        title: `AutoAction:${key}`,
        type: input.type,
        status: "READY",
        sourceContext: { ...((ctx ?? {}) as object), entityType, entityId, actionType: "CREATE_REPORT" },
        summary: summaryPack.summary,
      },
      select: { id: true },
    })
    .catch(() => null);

  if (!row?.id) return { ok: false, message: "Report creation failed." };
  return { ok: true, createdId: row.id, redirectUrl: `/reports/${row.id}`, message: "Report created." };
}

async function addToWatchlistByDomain(workspaceId: string, domain: string): Promise<AutoActionResult> {
  const wl = await ensureDefaultWatchlist(workspaceId);
  try {
    const created = await WatchlistRepository.addDomain(workspaceId, wl.id, { domain });
    return { ok: true, createdId: created.id, redirectUrl: `/watchlists/${wl.id}`, message: `Added to ${wl.name}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    // likely duplicate – treat as ok
    if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("already")) {
      return { ok: true, redirectUrl: `/watchlists/${wl.id}`, message: `Already in ${wl.name}.` };
    }
    return { ok: false, message: msg };
  }
}

export async function executeAutoAction(params: {
  entityType: AutoEntityType;
  entityId: string;
  actionType: AutoActionType;
  context?: Record<string, unknown>;
  workspaceId?: string | null;
}): Promise<AutoActionResult> {
  const entityType = params.entityType;
  const entityId = params.entityId;
  const actionType = params.actionType;
  const context = params.context ?? {};
  const workspaceId = params.workspaceId ?? null;

  if (!entityType || !entityId || !actionType) return { ok: false, message: "Missing entityType/entityId/actionType." };

  if (actionType === "OPEN_COMPARE") {
    if (entityType === "STORE") {
      const domain = await resolveDomainFromStore(entityId);
      if (!domain) return { ok: false, message: "No domain found for store." };
      return { ok: true, redirectUrl: `/compare?domains=${encodeURIComponent(domain)}`, message: "Opening compare." };
    }
    if (entityType === "PRODUCT_CLUSTER") {
      const domain = await resolveDomainFromProductCluster(entityId);
      if (!domain) return { ok: false, message: "No domain found for cluster." };
      return { ok: true, redirectUrl: `/compare?domains=${encodeURIComponent(domain)}`, message: "Opening compare." };
    }
    if (entityType === "WATCHLIST_ALERT") {
      const domains = await resolveDomainsForWatchlistAlert(entityId);
      if (!domains.length) return { ok: false, message: "No impacted domains found for alert." };
      return { ok: true, redirectUrl: `/compare?domains=${encodeURIComponent(domains.join(","))}`, message: "Opening compare." };
    }
    return { ok: false, message: "Compare not available for this entity." };
  }

  if (actionType === "ADD_TO_WATCHLIST") {
    if (!workspaceId) return { ok: false, message: "No active workspace." };
    let domain: string | null = null;
    if (typeof context.domain === "string") domain = context.domain;
    if (!domain && entityType === "STORE") domain = await resolveDomainFromStore(entityId);
    if (!domain && entityType === "PRODUCT_CLUSTER") domain = await resolveDomainFromProductCluster(entityId);
    if (!domain && entityType === "CREATIVE_CLUSTER") domain = await resolveDomainFromCreativeCluster(entityId);
    if (!domain) return { ok: false, message: "No domain available for watchlist." };
    return addToWatchlistByDomain(workspaceId, domain);
  }

  if (actionType === "OPEN_REVIEW") {
    const created = await openReviewQueueItem({
      type:
        entityType === "DISCOVERY_CANDIDATE"
          ? "DISCOVERY_CANDIDATE_REVIEW"
          : entityType === "CREATIVE_CLUSTER"
            ? "LOW_CONFIDENCE_CREATIVE_CLUSTER"
            : "HIGH_SCORE_UNVERIFIED_ITEM",
      title: `Auto review: ${entityType}`.slice(0, 80),
      reason: "Auto action execution",
      priority: 75,
      entityType,
      entityId,
      metadata: { from: "auto_actions", ...context } as object,
    }).catch(() => null);
    if (!created?.id) return { ok: false, message: "Failed to open review item." };
    return { ok: true, createdId: created.id, redirectUrl: "/review-queue", message: "Added to review queue." };
  }

  if (actionType === "PROMOTE_SOURCE") {
    if (entityType !== "DISCOVERY_CANDIDATE") return { ok: false, message: "Promote only supported for discovery candidates." };
    const candidate = await prisma.discoveryCandidate.findUnique({ where: { id: entityId } });
    if (!candidate) return { ok: false, message: "Candidate not found." };
    if (candidate.isPromoted) return { ok: true, redirectUrl: "/sources", message: "Already promoted." };

    const domain = candidate.domain;
    const existing = await prisma.source.findFirst({ where: { type: "SHOPIFY_DOMAIN", domain } });
    const source = existing
      ? existing
      : await SourceRepository.create({
          name: `Discovered: ${domain}`,
          type: "SHOPIFY_DOMAIN",
          domain,
          config: {
            sourceDomain: domain,
            discoveredFromCandidateId: candidate.id,
            discoveredFromSourceId: candidate.discoveredFromSourceId,
            discoveryReason: candidate.discoveryReason,
            discoveryScore: candidate.discoveryScore,
            promotedAt: new Date().toISOString(),
          },
        });
    await prisma.discoveryCandidate.update({
      where: { id: candidate.id },
      data: { isPromoted: true, promotedAt: new Date() },
    });
    return { ok: true, createdId: source.id, redirectUrl: `/sources/${source.id}`, message: "Promoted to source." };
  }

  if (actionType === "CREATE_SOURCE") {
    // create SHOPIFY_DOMAIN from resolved domain
    let domain: string | null = null;
    if (typeof context.domain === "string") domain = context.domain;
    if (!domain && entityType === "STORE") domain = await resolveDomainFromStore(entityId);
    if (!domain && entityType === "PRODUCT_CLUSTER") domain = await resolveDomainFromProductCluster(entityId);
    if (!domain) return { ok: false, message: "No domain available to create source." };
    const existing = await prisma.source.findFirst({ where: { type: "SHOPIFY_DOMAIN", domain } });
    if (existing) return { ok: true, createdId: existing.id, redirectUrl: `/sources/${existing.id}`, message: "Source already exists." };
    const created = await SourceRepository.create({
      name: `Manual: ${domain}`.slice(0, 100),
      type: "SHOPIFY_DOMAIN",
      domain,
      config: { sourceDomain: domain, discoveredBy: "auto_actions" },
    });
    return { ok: true, createdId: created.id, redirectUrl: `/sources/${created.id}`, message: "Source created." };
  }

  if (actionType === "OPEN_ADS") {
    if (entityType === "CREATIVE_CLUSTER") return { ok: true, redirectUrl: `/ads?creativeClusterId=${encodeURIComponent(entityId)}`, message: "Opening ads." };
    return { ok: false, message: "Open ads only supported for creative clusters." };
  }

  if (actionType === "OPEN_PRODUCTS") {
    if (entityType === "STORE") return { ok: true, redirectUrl: `/products?storeId=${encodeURIComponent(entityId)}`, message: "Opening products." };
    return { ok: false, message: "Open products only supported for stores." };
  }

  if (actionType === "CREATE_REPORT") {
    return createReportForEntity(entityType, entityId, context);
  }

  if (actionType === "OPEN_CAMPAIGN_BRIEF") {
    return {
      ok: true,
      redirectUrl: `/campaign-brief?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      message: "Opening creative brief.",
    };
  }

  if (actionType === "OPEN_OFFER_ANALYZER") {
    return {
      ok: true,
      redirectUrl: `/offer-analyzer?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      message: "Opening offer analyzer.",
    };
  }

  if (actionType === "OPEN_PERSONA_ANALYZER") {
    return {
      ok: true,
      redirectUrl: `/persona-analyzer?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      message: "Opening persona analyzer.",
    };
  }

  if (actionType === "CREATE_LEAD") {
    const domain = await resolveDomainForLeadLike(entityType, entityId, context);
    if (!domain) return { ok: false, message: "No domain available to create lead." };

    const lead = await upsertLeadByDomain({
      domain,
      storeId: entityType === "STORE" ? entityId : null,
      tags: ["from_auto_action"],
      notes: typeof context.reason === "string" ? context.reason : null,
    }).catch(() => null);
    if (!lead?.id) return { ok: false, message: "Lead create failed." };
    return { ok: true, createdId: lead.id, redirectUrl: `/leads/${lead.id}`, message: "Lead created." };
  }

  if (actionType === "OPEN_LEAD") {
    const domain = await resolveDomainForLeadLike(entityType, entityId, context);
    if (!domain) return { ok: false, message: "No domain available to open lead." };

    const lead = await prisma.lead.findUnique({ where: { domain }, select: { id: true } }).catch(() => null);
    if (!lead) return { ok: false, message: "Lead not found for domain." };
    return { ok: true, redirectUrl: `/leads/${lead.id}`, message: "Opening lead." };
  }

  if (actionType === "CREATE_GTM_LEAD") {
    if (!workspaceId) return { ok: false, message: "No active workspace." };
    const domain = await resolveDomainForLeadLike(entityType, entityId, context);
    if (!domain) return { ok: false, message: "No domain available for GTM lead." };

    const company =
      typeof context.company === "string" && context.company.trim() ? context.company.trim() : domain;
    const source = typeof context.source === "string" && context.source.trim() ? context.source.trim() : "auto_action";
    const painPoint =
      typeof context.reason === "string" && context.reason.trim()
        ? context.reason.trim()
        : "Auto-created from product intelligence";

    const est =
      typeof context.estimatedMRR === "number" && Number.isFinite(context.estimatedMRR)
        ? Math.round(context.estimatedMRR)
        : null;
    const pri =
      typeof context.priorityScore === "number" && Number.isFinite(context.priorityScore)
        ? Math.round(context.priorityScore)
        : null;

    const res = await createOrMergeGtmLead({
      workspaceId,
      company,
      website: `https://${domain}`,
      source,
      painPoint,
      estimatedMRR: est,
      priorityScore: pri,
      notes: typeof context.notes === "string" ? context.notes : null,
      stage: "PROSPECT",
    }).catch(() => null);
    if (!res) return { ok: false, message: "GTM lead create failed." };
    return {
      ok: true,
      createdId: res.id,
      redirectUrl: `/gtm?focus=${encodeURIComponent(res.id)}`,
      message: res.merged ? "Merged into existing GTM lead." : "GTM lead created.",
    };
  }

  if (actionType === "OPEN_GTM") {
    const focus =
      typeof context.gtmLeadId === "string" && context.gtmLeadId.trim() ? context.gtmLeadId.trim() : "";
    const resolved = focus || (await resolveGtmLeadId(entityType, entityId, context));
    return {
      ok: true,
      redirectUrl: resolved ? `/gtm?focus=${encodeURIComponent(resolved)}` : "/gtm",
      message: "Opening GTM workspace.",
    };
  }

  if (actionType === "SCHEDULE_FOLLOW_UP") {
    if (!workspaceId) return { ok: false, message: "No active workspace." };
    const daysRaw = Number(context.days);
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(90, Math.round(daysRaw))) : 7;
    const leadId = await resolveGtmLeadId(entityType, entityId, context);
    if (!leadId) return { ok: false, message: "No GTM lead found. Create a GTM lead first." };

    const when = new Date();
    when.setUTCDate(when.getUTCDate() + days);
    await prisma.gtmLead.update({ where: { id: leadId }, data: { nextFollowUpAt: when } });

    const logged = await recordGtmActivity(workspaceId, leadId, "FOLLOW_UP_SCHEDULED", `Auto action: follow-up in ${days}d`);
    const note = logged.ok ? `Follow-up set (+${days}d).` : `Follow-up set (+${days}d). (${logged.error})`;

    return {
      ok: true,
      redirectUrl: `/gtm?focus=${encodeURIComponent(leadId)}`,
      message: note,
    };
  }

  return { ok: false, message: "Unsupported action." };
}

