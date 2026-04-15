import prisma from "@/lib/prisma";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";

export type CopilotOpportunityLevel = "BREAKOUT" | "STRONG" | "WATCH" | "WEAK";
export type CopilotRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type CopilotSignal = { label: string; value: string | number | null };

export type CopilotAutoAction = { label: string; actionType: string; context?: Record<string, unknown> };

export type CopilotPayload = {
  summary: string;
  opportunityLevel: CopilotOpportunityLevel;
  riskLevel: CopilotRiskLevel;
  whyNow: string;
  businessOpportunity?: string;
  recommendedActions: string[];
  autoActions?: CopilotAutoAction[];
  supportingSignals: CopilotSignal[];
  warnings: string[];
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function riskFrom(flags: { saturated?: boolean; lowEvidence?: boolean; lowStoreCount?: boolean; stale?: boolean }): CopilotRiskLevel {
  const points =
    (flags.saturated ? 2 : 0) + (flags.lowEvidence ? 1 : 0) + (flags.lowStoreCount ? 1 : 0) + (flags.stale ? 1 : 0);
  if (points >= 3) return "HIGH";
  if (points >= 2) return "MEDIUM";
  return "LOW";
}

function oppFrom(score: number, lift: number): CopilotOpportunityLevel {
  if (score >= 85 || lift >= 8) return "BREAKOUT";
  if (score >= 72 || lift >= 4) return "STRONG";
  if (score >= 55 || lift >= 1.5) return "WATCH";
  return "WEAK";
}

function recencyHours(dt: Date | null): number | null {
  if (!dt) return null;
  return (Date.now() - dt.getTime()) / 3_600_000;
}

async function last7dDeltaProductCluster(clusterId: string, key: "readyToScaleScore" | "earlyMoverScore" | "marketLeaderScore") {
  try {
    const since = new Date(Date.now() - 8 * 86400000);
    const rows = await prisma.productClusterSnapshot.findMany({
      where: { productClusterId: clusterId, snapshotDate: { gte: since } },
      orderBy: { snapshotDate: "asc" },
      select: { readyToScaleScore: true, earlyMoverScore: true, marketLeaderScore: true },
      take: 60,
    });
    if (rows.length < 2) return null;
    const a = Number(rows[0]![key] ?? 0);
    const b = Number(rows[rows.length - 1]![key] ?? 0);
    return Math.round((b - a) * 10) / 10;
  } catch {
    return null;
  }
}

async function last7dDeltaCreativeWinner(clusterId: string) {
  try {
    const since = new Date(Date.now() - 8 * 86400000);
    const rows = await prisma.creativeClusterSnapshot.findMany({
      where: { creativeClusterId: clusterId, snapshotDate: { gte: since } },
      orderBy: { snapshotDate: "asc" },
      select: { creativeWinnerScore: true, scaleScore: true, creativeCount: true, storeCount: true },
      take: 60,
    });
    if (rows.length < 2) return null;
    const a = Number(rows[0]!.creativeWinnerScore ?? 0);
    const b = Number(rows[rows.length - 1]!.creativeWinnerScore ?? 0);
    return Math.round((b - a) * 10) / 10;
  } catch {
    return null;
  }
}

async function last7dStoreDeltas(storeId: string) {
  try {
    const since = new Date(Date.now() - 8 * 86400000);
    const rows = await prisma.storeSnapshot.findMany({
      where: { storeId, snapshotDate: { gte: since } },
      orderBy: { snapshotDate: "asc" },
      select: { trafficScore: true, productClusterCount: true, creativeClusterCount: true },
      take: 60,
    });
    if (rows.length < 2) return null;
    const a = rows[0]!;
    const b = rows[rows.length - 1]!;
    const dTraffic = (b.trafficScore ?? 0) - (a.trafficScore ?? 0);
    const dPc = b.productClusterCount - a.productClusterCount;
    const dCc = b.creativeClusterCount - a.creativeClusterCount;
    return { dTraffic, dPc, dCc };
  } catch {
    return null;
  }
}

export async function copilotProductCluster(id: string): Promise<CopilotPayload | null> {
  const c = await prisma.productCluster.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      storeCount: true,
      linkedRawRecordCount: true,
      linkedCreativeClusterCount: true,
      saturationScore: true,
      winningScore: true,
      readyToScaleScore: true,
      earlyMoverScore: true,
      marketLeaderScore: true,
      saturatedScore: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  });
  if (!c) return null;

  const recH = recencyHours(c.lastSeenAt);
  const stale = recH != null && recH > 72;

  // pick board rationale
  const ready = Number(c.readyToScaleScore ?? 0);
  const early = Number(c.earlyMoverScore ?? 0);
  const leader = Number(c.marketLeaderScore ?? 0);
  const sat = Number(c.saturatedScore ?? 0);

  const boardKey =
    ready >= early && ready >= leader && ready >= sat
      ? ("READY_TO_SCALE" as const)
      : early >= leader && early >= sat
        ? ("EARLY_MOVERS" as const)
        : leader >= sat
          ? ("MARKET_LEADERS" as const)
          : ("SATURATED_PRODUCTS" as const);

  const primaryScore =
    boardKey === "READY_TO_SCALE"
      ? ready
      : boardKey === "EARLY_MOVERS"
        ? early
        : boardKey === "MARKET_LEADERS"
          ? leader
          : sat;

  const delta7d =
    boardKey === "READY_TO_SCALE"
      ? await last7dDeltaProductCluster(c.id, "readyToScaleScore")
      : boardKey === "EARLY_MOVERS"
        ? await last7dDeltaProductCluster(c.id, "earlyMoverScore")
        : boardKey === "MARKET_LEADERS"
          ? await last7dDeltaProductCluster(c.id, "marketLeaderScore")
          : null;

  const moderateSaturation = c.saturationScore >= 25 && c.saturationScore <= 70;
  const highSaturation = c.saturatedScore >= 70 || c.saturationScore >= 80;
  const lowEvidence = c.linkedRawRecordCount < 5;
  const lowStoreCount = c.storeCount <= 1;

  const riskLevel = riskFrom({ saturated: highSaturation, lowEvidence, lowStoreCount, stale });
  const opportunityLevel = oppFrom(primaryScore, delta7d ?? 0);

  const whyNow =
    delta7d != null && delta7d >= 4
      ? `Score is accelerating (+${delta7d} vs 7d) with fresh activity.`
      : c.lastSeenAt
        ? `Recent activity (${c.lastSeenAt.toISOString().slice(0, 10)}) with multi-store signals.`
        : "Recent multi-signal activity.";

  const warnings: string[] = [];
  if (highSaturation) warnings.push("High saturation: may be late-stage or crowded.");
  if (lowEvidence) warnings.push("Thin evidence: linked raw records are low.");
  if (lowStoreCount) warnings.push("Single-store: could be fragile / not yet proven.");
  if (stale) warnings.push("Stale activity: last seen is old.");

  const recommendedActions: string[] = [];
  if (boardKey === "READY_TO_SCALE" && moderateSaturation && ready >= 70) {
    recommendedActions.push("Run a controlled test: validate creatives + landing pages, then scale cautiously.");
  } else if (boardKey === "EARLY_MOVERS" && early >= 70 && (recH == null || recH <= 48)) {
    recommendedActions.push("Move early: capture angles, save to watchlist, and monitor saturation weekly.");
  } else if (boardKey === "SATURATED_PRODUCTS" || highSaturation) {
    recommendedActions.push("Avoid copying directly: look for adjacent angles or differentiation.");
  } else if (boardKey === "MARKET_LEADERS" && leader >= 70) {
    recommendedActions.push("Study the leader: extract positioning, offers, and creative patterns.");
  } else {
    recommendedActions.push("Inspect underlying evidence and re-check after the next sync cycle.");
  }
  recommendedActions.push("Open compare for top store domains and benchmark cluster density.");

  const supportingSignals: CopilotSignal[] = [
    { label: "Board", value: boardKey },
    { label: "Primary score", value: Math.round(primaryScore * 10) / 10 },
    { label: "Δ 7d", value: delta7d },
    { label: "Stores", value: c.storeCount },
    { label: "Winning", value: c.winningScore },
    { label: "Saturation", value: c.saturationScore },
    { label: "Saturated", value: c.saturatedScore },
    { label: "Linked creatives", value: c.linkedCreativeClusterCount },
    { label: "Linked evidence", value: c.linkedRawRecordCount },
  ];

  const summary = `${c.title ?? "Product cluster"} looks ${opportunityLevel === "BREAKOUT" ? "hot" : opportunityLevel === "STRONG" ? "promising" : opportunityLevel === "WATCH" ? "worth watching" : "weak"} right now.`;

  return {
    summary,
    opportunityLevel,
    riskLevel,
    whyNow,
    recommendedActions,
    autoActions: [
      { label: "Generate brief", actionType: "OPEN_CAMPAIGN_BRIEF" },
      { label: "Analyze offer", actionType: "OPEN_OFFER_ANALYZER" },
      { label: "Analyze audience", actionType: "OPEN_PERSONA_ANALYZER" },
      { label: "Create lead", actionType: "CREATE_LEAD" },
      { label: "GTM lead", actionType: "CREATE_GTM_LEAD", context: { source: "copilot_product_cluster" } },
      { label: "Open GTM", actionType: "OPEN_GTM" },
      { label: "Add to watchlist", actionType: "ADD_TO_WATCHLIST" },
      { label: "Compare stores", actionType: "OPEN_COMPARE" },
      { label: "Create report", actionType: "CREATE_REPORT" },
      { label: "Open review", actionType: "OPEN_REVIEW" },
    ],
    supportingSignals,
    warnings,
  };
}

type CopilotCreativeClusterSelect = {
  id: string;
  fingerprint: string;
  platform: string;
  creativeWinnerScore: number;
  scaleScore: number;
  saturationScore: number;
  creativeCount: number;
  storeCount: number;
  productClusterCount: number;
  confidence: number;
  lastSeenAt: Date;
};

export async function copilotCreativeCluster(id: string): Promise<CopilotPayload | null> {
  const c = (await creativeClusterDb().findUnique({
    where: { id },
    select: {
      id: true,
      fingerprint: true,
      platform: true,
      creativeWinnerScore: true,
      scaleScore: true,
      saturationScore: true,
      creativeCount: true,
      storeCount: true,
      productClusterCount: true,
      confidence: true,
      lastSeenAt: true,
    },
  })) as CopilotCreativeClusterSelect | null;
  if (!c) return null;

  const delta7d = await last7dDeltaCreativeWinner(c.id);
  const stale = (recencyHours(c.lastSeenAt) ?? 0) > 72;
  const saturated = c.saturationScore >= 80;
  const lowSpread = c.storeCount < 2;

  const riskLevel = riskFrom({ saturated, lowEvidence: c.confidence < 0.55, lowStoreCount: lowSpread, stale });
  const opportunityLevel = oppFrom(Number(c.creativeWinnerScore ?? 0), delta7d ?? 0);
  const whyNow =
    delta7d != null && delta7d >= 4
      ? `Creative winner strength is rising (+${delta7d} vs 7d) with broader reuse.`
      : `High reuse and scale signals across ${c.storeCount} store(s).`;

  const warnings: string[] = [];
  if (saturated) warnings.push("Creative saturation is high: angle may be crowded.");
  if (lowSpread) warnings.push("Low store spread: reuse may not generalize yet.");
  if (c.confidence < 0.55) warnings.push("Low confidence merge: verify fingerprint matches before acting.");
  if (stale) warnings.push("Stale activity: last seen is old.");

  const recommendedActions: string[] = [
    "Open sample ads and extract hooks, structure, and CTA patterns.",
    "Check where it appears across stores (spread) and whether usage is accelerating.",
    "If strong: build variants (new offer / new creator / new landing) rather than copying 1:1.",
  ];

  const supportingSignals: CopilotSignal[] = [
    { label: "Board", value: "CREATIVE_WINNERS" },
    { label: "Platform", value: String(c.platform) },
    { label: "Winner score", value: Math.round(Number(c.creativeWinnerScore ?? 0) * 10) / 10 },
    { label: "Δ 7d", value: delta7d },
    { label: "Scale", value: c.scaleScore },
    { label: "Stores", value: c.storeCount },
    { label: "Creatives", value: c.creativeCount },
    { label: "Product clusters", value: c.productClusterCount },
  ];

  const summary = `Creative cluster shows ${opportunityLevel.toLowerCase()} potential with ${c.storeCount} store spread.`;

  return {
    summary,
    opportunityLevel,
    riskLevel,
    whyNow,
    recommendedActions,
    autoActions: [
      { label: "Generate brief", actionType: "OPEN_CAMPAIGN_BRIEF" },
      { label: "Analyze offer", actionType: "OPEN_OFFER_ANALYZER" },
      { label: "Analyze audience", actionType: "OPEN_PERSONA_ANALYZER" },
      { label: "Create lead", actionType: "CREATE_LEAD" },
      { label: "GTM lead", actionType: "CREATE_GTM_LEAD", context: { source: "copilot_creative_cluster" } },
      { label: "Open GTM", actionType: "OPEN_GTM" },
      { label: "Open ads", actionType: "OPEN_ADS" },
      { label: "Create report", actionType: "CREATE_REPORT" },
      { label: "Open review", actionType: "OPEN_REVIEW" },
    ],
    supportingSignals,
    warnings,
  };
}

export async function copilotStore(id: string): Promise<CopilotPayload | null> {
  const s = await prisma.store.findUnique({
    where: { id },
    select: { id: true, domain: true, name: true, lastSeenAt: true, trafficScore: true, winningProbabilityScore: true },
  });
  if (!s) return null;

  const deltas = await last7dStoreDeltas(s.id);
  const stale = (recencyHours(s.lastSeenAt) ?? 0) > 72;
  const lowEvidence = deltas == null;
  const riskLevel = riskFrom({ lowEvidence, stale });

  const lift = deltas ? deltas.dTraffic + deltas.dPc * 2 + deltas.dCc : 0;
  const opportunityLevel = oppFrom(clamp((s.winningProbabilityScore ?? 0) + (s.trafficScore ?? 0), 0, 100), lift);

  const whyNow =
    deltas && (deltas.dTraffic >= 6 || deltas.dPc >= 3)
      ? `Store momentum is up (Δ traffic ${deltas.dTraffic}, Δ clusters ${deltas.dPc}) vs 7d.`
      : "Store is active and accumulating product/creative signals.";

  const warnings: string[] = [];
  if (stale) warnings.push("Stale store activity: last seen is old.");
  if (lowEvidence) warnings.push("No snapshot history yet: run workers to build store timeline.");

  const recommendedActions: string[] = [
    "Open compare with close competitors and benchmark cluster density + creatives.",
    "Add domain to a watchlist and monitor for spikes.",
    "Review top product clusters and top creative clusters for reusable patterns.",
  ];

  const oppRaw = clamp((s.winningProbabilityScore ?? 0) + (s.trafficScore ?? 0), 0, 200);
  const businessOpportunity =
    oppRaw >= 150
      ? "Acquisition target: strong momentum signals—evaluate brand moat, CAC, and retention."
      : oppRaw >= 115
        ? "Partnership candidate: consistent signals—consider affiliate/creator collaboration outreach."
        : "Client prospect: explore paid growth / creative systems as a service offer.";

  const supportingSignals: CopilotSignal[] = [
    { label: "Domain", value: s.domain },
    { label: "Traffic score", value: s.trafficScore ?? null },
    { label: "Win prob", value: s.winningProbabilityScore ?? null },
    { label: "Δ traffic (7d)", value: deltas?.dTraffic ?? null },
    { label: "Δ product clusters", value: deltas?.dPc ?? null },
    { label: "Δ creative clusters", value: deltas?.dCc ?? null },
  ];

  const summary = `${s.domain} is ${opportunityLevel === "BREAKOUT" ? "accelerating" : opportunityLevel === "STRONG" ? "moving" : "stable"} with actionable signals.`;

  return {
    summary,
    opportunityLevel,
    riskLevel,
    whyNow,
    businessOpportunity,
    recommendedActions,
    autoActions: [
      { label: "Generate brief", actionType: "OPEN_CAMPAIGN_BRIEF" },
      { label: "Analyze offer", actionType: "OPEN_OFFER_ANALYZER" },
      { label: "Analyze audience", actionType: "OPEN_PERSONA_ANALYZER" },
      { label: "Create lead", actionType: "CREATE_LEAD", context: { domain: s.domain } },
      { label: "Open lead", actionType: "OPEN_LEAD", context: { domain: s.domain } },
      {
        label: "GTM lead",
        actionType: "CREATE_GTM_LEAD",
        context: { domain: s.domain, source: "copilot_store", reason: businessOpportunity },
      },
      { label: "Open GTM", actionType: "OPEN_GTM", context: { domain: s.domain } },
      {
        label: "Schedule GTM follow-up",
        actionType: "SCHEDULE_FOLLOW_UP",
        context: { domain: s.domain, days: 5 },
      },
      { label: "Compare stores", actionType: "OPEN_COMPARE" },
      { label: "Add to watchlist", actionType: "ADD_TO_WATCHLIST", context: { domain: s.domain } },
      { label: "Create report", actionType: "CREATE_REPORT" },
      { label: "Open products", actionType: "OPEN_PRODUCTS" },
    ],
    supportingSignals,
    warnings,
  };
}

export async function copilotWatchlistAlert(id: string): Promise<CopilotPayload | null> {
  const a = await prisma.watchlistAlertLog.findUnique({
    where: { id },
    select: { id: true, watchlistId: true, type: true, severity: true, title: true, message: true, delta: true, createdAt: true },
  });
  if (!a) return null;

  const riskLevel: CopilotRiskLevel = a.severity === "HIGH" ? "HIGH" : a.severity === "WARNING" ? "MEDIUM" : "LOW";
  const opportunityLevel: CopilotOpportunityLevel =
    a.type === "READY_TO_SCALE_APPEARED" || a.type === "EARLY_MOVER_APPEARED" ? "STRONG" : a.severity === "HIGH" ? "STRONG" : "WATCH";

  const whyNow =
    a.type === "STORE_TREND_SPIKE"
      ? "Competitor momentum spiked: treat as a near-term threat/opportunity."
      : a.type === "PRODUCT_CLUSTER_SPIKE"
        ? "Competitor product clustering expanded: likely new winners or broader distribution."
        : a.type === "CREATIVE_CLUSTER_SPIKE"
          ? "Competitor creative output expanded: new angles are being tested."
          : a.type === "READY_TO_SCALE_APPEARED"
            ? "A ready-to-scale signal appeared in the watchlist: act quickly."
            : "A new early-mover signal appeared: opportunity window may be short.";

  const warnings: string[] = [];
  if (a.severity === "INFO") warnings.push("Low severity spike: confirm it persists over 2–3 days before reacting.");

  const recommendedActions: string[] = [
    "Open compare for affected domains and identify which clusters drove the change.",
    "Check Creative Winners + Early Movers boards for related items.",
    "Create or adjust saved filters to track this theme.",
  ];

  const supportingSignals: CopilotSignal[] = [
    { label: "Alert type", value: a.type },
    { label: "Severity", value: a.severity },
    { label: "When", value: a.createdAt.toISOString() },
    { label: "Delta", value: a.delta ? "present" : null },
  ];

  return {
    summary: a.title,
    opportunityLevel,
    riskLevel,
    whyNow,
    recommendedActions,
    autoActions: [
      { label: "Generate brief", actionType: "OPEN_CAMPAIGN_BRIEF" },
      { label: "Analyze offer", actionType: "OPEN_OFFER_ANALYZER" },
      { label: "Analyze audience", actionType: "OPEN_PERSONA_ANALYZER" },
      { label: "Create lead", actionType: "CREATE_LEAD" },
      { label: "Compare impacted", actionType: "OPEN_COMPARE" },
      { label: "Create spike report", actionType: "CREATE_REPORT" },
    ],
    supportingSignals,
    warnings,
  };
}

export async function copilotEntity(params: { entityType: string; entityId: string }): Promise<CopilotPayload | null> {
  const t = params.entityType.trim().toUpperCase();
  const id = params.entityId.trim();
  if (!t || !id) return null;
  if (t === "PRODUCT_CLUSTER") return copilotProductCluster(id);
  if (t === "CREATIVE_CLUSTER") return copilotCreativeCluster(id);
  if (t === "STORE") return copilotStore(id);
  if (t === "WATCHLIST_ALERT") return copilotWatchlistAlert(id);
  return null;
}

