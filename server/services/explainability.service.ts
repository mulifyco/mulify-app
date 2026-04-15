import prisma from "@/lib/prisma";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";

export type ExplainabilityPayload = {
  summary: string;
  reasons: string[];
  supportingSignals: Array<{ label: string; value: string | number | null }>;
  confidence: number; // 0..1
  recommendedAction?: string;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function formatAge(d: Date): string {
  const days = Math.round(daysBetween(new Date(), d));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

export async function explainProductCluster(clusterId: string): Promise<ExplainabilityPayload | null> {
  const c = await prisma.productCluster
    .findUnique({
      where: { id: clusterId },
      select: {
        id: true,
        title: true,
        key: true,
        confidence: true,
        storeCount: true,
        linkedCreativeClusterCount: true,
        winningScore: true,
        readyToScaleScore: true,
        earlyMoverScore: true,
        marketLeaderScore: true,
        saturationScore: true,
        saturatedScore: true,
        linkedRawRecordCount: true,
        firstSeenAt: true,
        lastSeenAt: true,
        landingPageCount: true,
        collectionCount: true,
      },
    })
    .catch(() => null);
  if (!c) return null;

  const persistenceDays = Math.max(0, Math.round(daysBetween(c.firstSeenAt, c.lastSeenAt)));
  const freshnessDays = Math.max(0, Math.round(daysBetween(new Date(), c.lastSeenAt)));

  const topScore = Math.max(
    Number(c.readyToScaleScore ?? 0),
    Number(c.earlyMoverScore ?? 0),
    Number(c.marketLeaderScore ?? 0),
    Number(c.saturatedScore ?? 0)
  );

  const reasons: string[] = [];
  if (c.storeCount >= 3) reasons.push(`Appears across ${c.storeCount} stores (strong cross-store signal).`);
  else reasons.push(`Seen on ${c.storeCount} store(s) (early signal; validate).`);

  if (c.linkedCreativeClusterCount >= 3)
    reasons.push(`Has creative overlap (${c.linkedCreativeClusterCount} linked creative clusters), suggesting scalable demand.`);
  else if (c.linkedCreativeClusterCount > 0)
    reasons.push(`Some creative overlap (${c.linkedCreativeClusterCount}), but not yet strong.`);
  else reasons.push(`No linked creative overlap yet (could be under-linked).`);

  reasons.push(`Winning score ${c.winningScore}/100 and saturation ${c.saturationScore}/100 shape opportunity vs crowding.`);

  if (c.readyToScaleScore >= 80) reasons.push(`Ready-to-scale is high (${Math.round(c.readyToScaleScore)}).`);
  if (c.earlyMoverScore >= 80) reasons.push(`Early-mover signal is high (${Math.round(c.earlyMoverScore)}).`);
  if (c.marketLeaderScore >= 90) reasons.push(`Market-leader dominance is strong (${Math.round(c.marketLeaderScore)}).`);
  if (c.saturatedScore >= 85) reasons.push(`Saturated risk is high (${Math.round(c.saturatedScore)}); enter cautiously.`);

  if (freshnessDays <= 3) reasons.push(`Fresh activity (last seen ${formatAge(c.lastSeenAt)}).`);
  else reasons.push(`Last seen ${formatAge(c.lastSeenAt)} (freshness affects ranking).`);

  if (persistenceDays >= 14) reasons.push(`Persistent signal over ~${persistenceDays} days (not a one-off).`);
  else reasons.push(`Persistence ~${persistenceDays} days (could still be emerging).`);

  if (c.linkedRawRecordCount >= 5) reasons.push(`Backed by ${c.linkedRawRecordCount} linked raw records.`);
  else reasons.push(`Limited linked evidence (${c.linkedRawRecordCount}); consider linking review.`);

  const supportingSignals = [
    { label: "storeCount", value: c.storeCount },
    { label: "linkedCreativeOverlap", value: c.linkedCreativeClusterCount },
    { label: "winningScore", value: c.winningScore },
    { label: "readyToScaleScore", value: Math.round(Number(c.readyToScaleScore ?? 0)) },
    { label: "earlyMoverScore", value: Math.round(Number(c.earlyMoverScore ?? 0)) },
    { label: "marketLeaderScore", value: Math.round(Number(c.marketLeaderScore ?? 0)) },
    { label: "saturationScore", value: c.saturationScore },
    { label: "saturatedScore", value: Math.round(Number(c.saturatedScore ?? 0)) },
    { label: "freshness", value: formatAge(c.lastSeenAt) },
    { label: "persistenceDays", value: persistenceDays },
    { label: "linkedRawEvidence", value: c.linkedRawRecordCount },
  ];

  const recommendedAction =
    c.linkedRawRecordCount < 3
      ? "Validate entity links (landing pages / raw evidence) and re-check board rank."
      : c.readyToScaleScore >= 80
        ? "Open Ready to Scale board and review creatives + landing pages."
        : c.earlyMoverScore >= 80
          ? "Open Early Movers board and look for first-mover timing."
          : "Open the relevant board and review stores + creatives for context.";

  return {
    summary: `${c.title ?? "Product cluster"} · topScore ${Math.round(topScore)} · ${c.storeCount} stores`,
    reasons: reasons.slice(0, 9),
    supportingSignals,
    confidence: clamp01(Number(c.confidence ?? 0.6)),
    recommendedAction,
  };
}

type CreativeClusterExplainSelect = {
  id: string;
  fingerprint: string;
  platform: string;
  creativeCount: number;
  storeCount: number;
  productClusterCount: number;
  confidence: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  saturationScore: number;
  scaleScore: number;
  creativeWinnerScore: number;
};

export async function explainCreativeCluster(clusterId: string): Promise<ExplainabilityPayload | null> {
  const c = (await creativeClusterDb()
    .findUnique({
      where: { id: clusterId },
      select: {
        id: true,
        fingerprint: true,
        platform: true,
        creativeCount: true,
        storeCount: true,
        productClusterCount: true,
        confidence: true,
        firstSeenAt: true,
        lastSeenAt: true,
        saturationScore: true,
        scaleScore: true,
        creativeWinnerScore: true,
      },
    })
    .catch(() => null)) as CreativeClusterExplainSelect | null;
  if (!c) return null;

  const recency = formatAge(c.lastSeenAt);
  const persistenceDays = Math.max(0, Math.round(daysBetween(c.firstSeenAt, c.lastSeenAt)));

  const reasons: string[] = [];
  if (c.scaleScore >= 70) reasons.push(`High scale score (${c.scaleScore}/100) indicates broad reach and repeatable performance.`);
  else reasons.push(`Scale score ${c.scaleScore}/100 (growth potential depends on store spread and volume).`);

  if (c.creativeCount >= 10) reasons.push(`Seen in ${c.creativeCount} creatives (volume signal).`);
  else reasons.push(`Creative count ${c.creativeCount} (early pattern).`);

  if (c.storeCount >= 3) reasons.push(`Used across ${c.storeCount} stores (transferable creative).`);
  else if (c.storeCount > 0) reasons.push(`Limited store spread (${c.storeCount}); validate generality.`);
  else reasons.push(`No store linkage yet (likely missing links).`);

  if (c.productClusterCount >= 2) reasons.push(`Overlaps with ${c.productClusterCount} product clusters (cross-signal strength).`);

  reasons.push(`Creative winner score ${Math.round(c.creativeWinnerScore)}/100 balances scale vs saturation.`);

  if (c.saturationScore >= 80) reasons.push(`High saturation (${c.saturationScore}/100) suggests this creative is widely copied.`);
  else reasons.push(`Saturation ${c.saturationScore}/100 (lower can mean underexposed).`);

  reasons.push(`Recency: last seen ${recency}; persistence ~${persistenceDays} days.`);
  reasons.push(`Platform: ${String(c.platform)}; merge confidence ${(c.confidence ?? 0.7).toFixed(2)}.`);

  const recommendedAction =
    c.creativeWinnerScore >= 85
      ? "Open Creative Winners and inspect landing pages + store adoption."
      : c.scaleScore >= 70
        ? "Compare stores using this creative; check product cluster overlap."
        : "Validate links (shop/domain) then reassess scale and saturation.";

  return {
    summary: `Creative cluster · score ${Math.round(c.creativeWinnerScore)} · ${c.storeCount} stores · ${c.creativeCount} creatives`,
    reasons: reasons.slice(0, 9),
    supportingSignals: [
      { label: "platform", value: String(c.platform) },
      { label: "creativeWinnerScore", value: Math.round(Number(c.creativeWinnerScore ?? 0)) },
      { label: "scaleScore", value: c.scaleScore },
      { label: "saturationScore", value: c.saturationScore },
      { label: "creativeCount", value: c.creativeCount },
      { label: "storeCount", value: c.storeCount },
      { label: "productClusterCount", value: c.productClusterCount },
      { label: "recency", value: recency },
      { label: "persistenceDays", value: persistenceDays },
    ],
    confidence: clamp01(Number(c.confidence ?? 0.7)),
    recommendedAction,
  };
}

export async function explainDiscoveryCandidate(id: string): Promise<ExplainabilityPayload | null> {
  const model = (prisma as any).discoveryCandidate;
  const select = {
    id: true,
    domain: true,
    discoveryScore: true,
    discoveryReason: true,
    rawEvidenceCount: true,
    isPromoted: true,
    promotedAt: true,
    sourceTypeHint: true,
    createdAt: true,
    updatedAt: true,
  };

  const c =
    (await model?.findUnique?.({ where: { id }, select }).catch?.(() => null)) ??
    (await model?.findFirst?.({ where: { domain: id }, select }).catch?.(() => null));
  if (!c) return null;

  const score = Number(c.discoveryScore ?? 0);
  const reasons: string[] = [];
  reasons.push(`Discovery score ${score}/100 from commerce signals and repeated evidence.`);
  if (String(c.discoveryReason || "").includes("myshopify") || String(c.discoveryReason || "").includes("cdn"))
    reasons.push(`Direct Shopify infrastructure markers were detected (myshopify/cdn).`);
  if (String(c.discoveryReason || "").includes("products_path"))
    reasons.push(`Commerce paths detected (/products/), suggesting a storefront.`);
  if (String(c.discoveryReason || "").includes("collections_path"))
    reasons.push(`Collections paths detected (/collections/), consistent with Shopify catalogs.`);
  if (String(c.discoveryReason || "").includes("tiktok_outbound"))
    reasons.push(`Appeared as outbound TikTok link (higher likelihood of DTC commerce).`);
  if ((c.rawEvidenceCount ?? 0) >= 5)
    reasons.push(`Multiple evidence points (${c.rawEvidenceCount}) reduce false positives.`);

  reasons.push(`Source hint: ${c.sourceTypeHint}.`);
  reasons.push(c.isPromoted ? `Already promoted (${c.promotedAt ? formatAge(new Date(c.promotedAt)) : "recently"}).` : "Not promoted yet.");

  const recommendedAction = c.isPromoted
    ? "Open Sources to inspect the created SHOPIFY_DOMAIN source health."
    : score >= 70
      ? "Promote if domain looks like a real storefront; then run Shopify domain sync."
      : "Keep in queue; gather more evidence before promoting.";

  return {
    summary: `${c.domain} · score ${score} · evidence ${c.rawEvidenceCount ?? 0}`,
    reasons: reasons.slice(0, 9),
    supportingSignals: [
      { label: "domain", value: c.domain },
      { label: "discoveryScore", value: score },
      { label: "rawEvidenceCount", value: c.rawEvidenceCount ?? 0 },
      { label: "promoted", value: c.isPromoted ? "yes" : "no" },
      { label: "sourceTypeHint", value: c.sourceTypeHint ?? null },
    ],
    confidence: clamp01(score / 100),
    recommendedAction,
  };
}

export async function explainWatchlistAlert(id: string): Promise<ExplainabilityPayload | null> {
  const a = await prisma.watchlistAlertLog
    .findUnique({
      where: { id },
      select: {
        id: true,
        watchlistId: true,
        type: true,
        title: true,
        message: true,
        severity: true,
        delta: true,
        createdAt: true,
        watchlist: { select: { id: true, name: true } },
      },
    })
    .catch(() => null);
  if (!a) return null;

  const d = (a.delta ?? {}) as any;
  const reasons: string[] = [];
  reasons.push(`Alert type ${a.type} triggered on watchlist "${a.watchlist?.name ?? a.watchlistId}".`);
  reasons.push(a.message);

  if (d.previous != null && d.current != null) {
    reasons.push(`Snapshot changed: ${JSON.stringify(d.previous)} → ${JSON.stringify(d.current)}`.slice(0, 420));
  } else if (d.delta != null) {
    reasons.push(`Delta: ${JSON.stringify(d.delta)}`.slice(0, 420));
  } else if (Object.keys(d).length) {
    reasons.push(`Delta payload: ${JSON.stringify(d).slice(0, 320)}`);
  }

  const recommendedAction =
    a.type === "STORE_TREND_SPIKE"
      ? "Open the watchlist compare view and inspect store-level trend + creatives."
      : a.type === "READY_TO_SCALE_APPEARED"
        ? "Open Ready to Scale and filter to watchlist stores."
        : a.type === "EARLY_MOVER_APPEARED"
          ? "Open Early Movers and inspect novelty vs saturation."
          : "Open watchlist detail and review recent runs + clusters.";

  return {
    summary: `${a.title} · ${a.severity} · ${formatAge(a.createdAt)}`,
    reasons: reasons.slice(0, 8),
    supportingSignals: [
      { label: "severity", value: String(a.severity) },
      { label: "type", value: String(a.type) },
      { label: "watchlist", value: a.watchlist?.name ?? null },
      { label: "createdAt", value: a.createdAt.toISOString() },
    ],
    confidence: clamp01(a.severity === "HIGH" ? 0.85 : a.severity === "WARNING" ? 0.7 : 0.55),
    recommendedAction,
  };
}

export async function explainEntity(input: { entityType: string; entityId: string }): Promise<ExplainabilityPayload | null> {
  const t = input.entityType.toUpperCase();
  const id = input.entityId;
  if (!id) return null;

  if (t === "PRODUCT_CLUSTER") return explainProductCluster(id);
  if (t === "CREATIVE_CLUSTER") return explainCreativeCluster(id);
  if (t === "DISCOVERY_CANDIDATE") return explainDiscoveryCandidate(id);
  if (t === "WATCHLIST_ALERT") return explainWatchlistAlert(id);
  return null;
}

