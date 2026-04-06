import Link from "next/link";
import type { EntityType } from "@/types";
import EntityWarningChips from "@/components/internal/EntityWarningChips";
import SectionHeader from "@/components/internal/SectionHeader";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";

const hrefFor: Partial<Record<EntityType, (id: string) => string>> = {
  AD: (id) => `/ads/${id}`,
  STORE: (id) => `/stores/${id}`,
  PRODUCT: (id) => `/products/${id}`,
  COLLECTION: (id) => `/collections/${id}`,
  LANDING_PAGE: (id) => `/landing-pages/${id}`,
};

type InferredRow = {
  id: string;
  fromEntityType: string;
  fromEntityId: string;
  toEntityType: string;
  toEntityId: string;
  strength: number;
  sourceReason: string;
  staleAt: Date | null;
  lastConfirmedAt: Date;
};

type MergeRow = {
  id: string;
  primaryEntityId: string;
  candidateEntityId: string;
  level: string;
  confidence: number;
  mergeReason: string;
};

type SignalRow = {
  id: string;
  type: string;
  severity: string;
  confidence: number;
  active: boolean;
  lastSeenAt: Date;
};

function trendLabel(trend: string | null | undefined): string {
  if (!trend) return "—";
  if (trend === "RISING") return "Rising";
  if (trend === "FALLING") return "Falling";
  return "Stable";
}

function trendChipClass(trend: string | null | undefined): string {
  if (trend === "RISING") return "bg-emerald-950/50 text-emerald-400 border-emerald-800/60";
  if (trend === "FALLING") return "bg-rose-950/40 text-rose-400 border-rose-800/50";
  return "bg-gray-800 text-gray-400 border-gray-700";
}

function prominenceLevelChipClass(level: string | null | undefined): string {
  if (level === "HERO") return "bg-amber-950/50 text-amber-300 border-amber-700/50";
  if (level === "FEATURED") return "bg-violet-950/45 text-violet-300 border-violet-800/50";
  if (level === "STANDARD") return "bg-gray-800 text-gray-300 border-gray-700";
  if (level === "WEAK") return "bg-slate-900 text-slate-500 border-slate-800";
  return "bg-gray-800 text-gray-500 border-gray-700";
}

function prominenceLevelLabel(level: string | null | undefined): string {
  if (!level) return "—";
  return level.charAt(0) + level.slice(1).toLowerCase();
}

function opportunityLevelChipClass(level: string | null | undefined): string {
  if (level === "BREAKOUT") return "bg-amber-950/55 text-amber-200 border-amber-600/50";
  if (level === "STRONG") return "bg-emerald-950/45 text-emerald-300 border-emerald-800/50";
  if (level === "WATCH") return "bg-orange-950/35 text-orange-300 border-orange-900/45";
  if (level === "WEAK") return "bg-slate-900 text-slate-500 border-slate-800";
  return "bg-gray-800 text-gray-500 border-gray-700";
}

function opportunityLevelLabel(level: string | null | undefined): string {
  if (!level) return "—";
  return level.charAt(0) + level.slice(1).toLowerCase();
}

export type CatalogProminenceRollup = {
  avgProminence: number | null;
  heroCount: number;
  featuredCount: number;
  productsWithProminence: number;
  productTotal: number;
};

export default function IntelligenceContextPanel({
  title = "Intelligence",
  mergeEntityType,
  inferredOutgoing,
  inferredIncoming,
  mergeCandidates,
  signals,
  breakdownV2,
  reasonCodes,
  trafficScore,
  trafficTrend,
  trafficReasonCodes,
  trafficBreakdown,
  trafficUpdatedAt,
  prominenceScore,
  prominenceLevel,
  prominenceReasonCodes,
  prominenceBreakdown,
  prominenceUpdatedAt,
  catalogProminence,
  winningProbabilityScore,
  opportunityLevel,
  fusionReasonCodes,
  fusionBreakdown,
  opportunityUpdatedAt,
}: {
  title?: string;
  mergeEntityType: EntityType;
  inferredOutgoing: InferredRow[];
  inferredIncoming: InferredRow[];
  mergeCandidates: MergeRow[];
  signals: SignalRow[];
  breakdownV2?: unknown;
  reasonCodes?: string[];
  trafficScore?: number | null;
  trafficTrend?: string | null;
  trafficReasonCodes?: string[] | null;
  trafficBreakdown?: unknown;
  trafficUpdatedAt?: Date | null;
  prominenceScore?: number | null;
  prominenceLevel?: string | null;
  prominenceReasonCodes?: string[] | null;
  prominenceBreakdown?: unknown;
  prominenceUpdatedAt?: Date | null;
  catalogProminence?: CatalogProminenceRollup | null;
  winningProbabilityScore?: number | null;
  opportunityLevel?: string | null;
  fusionReasonCodes?: string[] | null;
  fusionBreakdown?: unknown;
  opportunityUpdatedAt?: Date | null;
}) {
  const hasTraffic =
    trafficScore != null ||
    (trafficReasonCodes && trafficReasonCodes.length > 0) ||
    trafficBreakdown != null;

  const insightsFromBreakdown =
    prominenceBreakdown &&
    typeof prominenceBreakdown === "object" &&
    prominenceBreakdown !== null &&
    "insights" in prominenceBreakdown
      ? (prominenceBreakdown as { insights?: { collectionDiversity?: string; homepageNote?: string } })
          .insights
      : undefined;

  const hasProminence =
    prominenceScore != null ||
    (prominenceReasonCodes && prominenceReasonCodes.length > 0) ||
    prominenceBreakdown != null;

  const hasCatalogProminence =
    catalogProminence != null && catalogProminence.productTotal > 0;

  const fusionBreakoutHints =
    fusionBreakdown &&
    typeof fusionBreakdown === "object" &&
    fusionBreakdown !== null &&
    "breakoutHints" in fusionBreakdown &&
    Array.isArray((fusionBreakdown as { breakoutHints: unknown }).breakoutHints)
      ? ((fusionBreakdown as { breakoutHints: string[] }).breakoutHints.filter(
          (x): x is string => typeof x === "string"
        ))
      : [];

  const hasFusion =
    winningProbabilityScore != null ||
    (fusionReasonCodes && fusionReasonCodes.length > 0) ||
    fusionBreakdown != null;

  const hasAnything =
    inferredOutgoing.length +
      inferredIncoming.length +
      mergeCandidates.length +
      signals.length >
    0;

  if (
    !hasAnything &&
    !breakdownV2 &&
    (!reasonCodes || reasonCodes.length === 0) &&
    !hasTraffic &&
    !hasProminence &&
    !hasCatalogProminence &&
    !hasFusion
  ) {
    return null;
  }

  const signalChips = signals.slice(0, 12).map(
    (s) => `${s.type.replace(/_/g, " ")} · ${s.severity.toLowerCase()}`
  );

  return (
    <div className="rounded-lg border border-violet-900/35 bg-violet-950/10 p-4 space-y-4">
      <SectionHeader title={title} description="Deterministic graph + signals" />

      {hasTraffic && (
        <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/15 px-3 py-3 space-y-3">
          <div className="text-[11px] font-semibold text-cyan-400 uppercase">Traffic</div>
          <div className="flex flex-wrap items-center gap-3">
            {trafficScore != null && (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tabular-nums">{trafficScore}</span>
                <span className="text-[11px] text-gray-500 uppercase">/ 100</span>
              </div>
            )}
            {trafficTrend && (
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-1 rounded border ${trendChipClass(trafficTrend)}`}
              >
                {trendLabel(trafficTrend)}
              </span>
            )}
            {trafficUpdatedAt && (
              <span className="text-[10px] text-gray-600">
                Updated{" "}
                {trafficUpdatedAt instanceof Date
                  ? trafficUpdatedAt.toISOString().slice(0, 10)
                  : "—"}
              </span>
            )}
          </div>
          {trafficReasonCodes && trafficReasonCodes.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-cyan-500/80 uppercase mb-1.5">
                Traffic reason codes
              </div>
              <div className="flex flex-wrap gap-1.5">
                {trafficReasonCodes.slice(0, 20).map((c) => (
                  <span
                    key={c}
                    className="text-[10px] px-2 py-0.5 rounded bg-gray-900/80 text-cyan-200/70 font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {trafficBreakdown != null && (
            <div>
              <div className="text-[10px] font-semibold text-cyan-500/80 uppercase mb-1.5">
                Traffic breakdown
              </div>
              <JsonPayloadViewer data={trafficBreakdown} maxCollapsedHeight={200} />
            </div>
          )}
        </div>
      )}

      {hasCatalogProminence && catalogProminence && (
        <div className="rounded-lg border border-amber-900/35 bg-amber-950/10 px-3 py-3 space-y-2">
          <div className="text-[11px] font-semibold text-amber-400 uppercase">Catalog prominence</div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Avg score{" "}
            <span className="text-gray-200 tabular-nums">
              {catalogProminence.productsWithProminence === 0
                ? "— (run prominence recompute)"
                : catalogProminence.avgProminence != null
                  ? catalogProminence.avgProminence.toFixed(1)
                  : "—"}
            </span>
            {" · "}
            Hero {catalogProminence.heroCount.toLocaleString()} · Featured{" "}
            {catalogProminence.featuredCount.toLocaleString()}
            {" · "}
            Scored {catalogProminence.productsWithProminence.toLocaleString()} /{" "}
            {catalogProminence.productTotal.toLocaleString()} products
          </p>
          <p className="text-[10px] text-gray-600">
            Per-product prominence blends PDP ads, collections, media, sync confirmations, and store traffic
            lift.
          </p>
        </div>
      )}

      {hasProminence && (
        <div className="rounded-lg border border-fuchsia-900/40 bg-fuchsia-950/12 px-3 py-3 space-y-3">
          <div className="text-[11px] font-semibold text-fuchsia-400 uppercase">Prominence</div>
          <div className="flex flex-wrap items-center gap-3">
            {prominenceScore != null && (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tabular-nums">{prominenceScore}</span>
                <span className="text-[11px] text-gray-500 uppercase">/ 100</span>
              </div>
            )}
            {prominenceLevel && (
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-1 rounded border ${prominenceLevelChipClass(prominenceLevel)}`}
              >
                {prominenceLevelLabel(prominenceLevel)}
              </span>
            )}
            {prominenceUpdatedAt && (
              <span className="text-[10px] text-gray-600">
                Updated{" "}
                {prominenceUpdatedAt instanceof Date
                  ? prominenceUpdatedAt.toISOString().slice(0, 10)
                  : "—"}
              </span>
            )}
          </div>
          {prominenceReasonCodes && prominenceReasonCodes.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-fuchsia-500/80 uppercase mb-1.5">
                Prominence reason codes
              </div>
              <div className="flex flex-wrap gap-1.5">
                {prominenceReasonCodes.slice(0, 22).map((c) => (
                  <span
                    key={c}
                    className="text-[10px] px-2 py-0.5 rounded bg-gray-900/80 text-fuchsia-200/70 font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {insightsFromBreakdown?.collectionDiversity && (
            <div>
              <div className="text-[10px] font-semibold text-fuchsia-500/80 uppercase mb-1">
                Collection diversity
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {insightsFromBreakdown.collectionDiversity}
              </p>
            </div>
          )}
          {insightsFromBreakdown?.homepageNote && (
            <div>
              <div className="text-[10px] font-semibold text-fuchsia-500/80 uppercase mb-1">
                Homepage inference
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">{insightsFromBreakdown.homepageNote}</p>
            </div>
          )}
          {prominenceBreakdown != null && (
            <div>
              <div className="text-[10px] font-semibold text-fuchsia-500/80 uppercase mb-1.5">
                Prominence breakdown
              </div>
              <JsonPayloadViewer data={prominenceBreakdown} maxCollapsedHeight={220} />
            </div>
          )}
        </div>
      )}

      {hasFusion && (
        <div className="rounded-lg border border-lime-900/45 bg-lime-950/10 px-3 py-3 space-y-3">
          <div className="text-[11px] font-semibold text-lime-400 uppercase">Winning probability</div>
          <div className="flex flex-wrap items-center gap-3">
            {winningProbabilityScore != null && (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white tabular-nums">
                  {winningProbabilityScore}
                </span>
                <span className="text-[11px] text-gray-500 uppercase">/ 100</span>
              </div>
            )}
            {opportunityLevel && (
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-1 rounded border ${opportunityLevelChipClass(opportunityLevel)}`}
              >
                {opportunityLevelLabel(opportunityLevel)}
              </span>
            )}
            {opportunityUpdatedAt && (
              <span className="text-[10px] text-gray-600">
                Updated{" "}
                {opportunityUpdatedAt instanceof Date
                  ? opportunityUpdatedAt.toISOString().slice(0, 10)
                  : "—"}
              </span>
            )}
          </div>
          {(fusionBreakoutHints.length > 0 || opportunityLevel === "BREAKOUT") && (
            <div className="rounded border border-amber-900/40 bg-amber-950/15 px-3 py-2">
              <div className="text-[10px] font-semibold text-amber-500 uppercase mb-2">
                Breakout signals
              </div>
              <EntityWarningChips
                items={
                  fusionBreakoutHints.length > 0
                    ? fusionBreakoutHints
                    : ["Breakout opportunity level — review fusion inputs"]
                }
              />
            </div>
          )}
          {fusionReasonCodes && fusionReasonCodes.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-lime-500/80 uppercase mb-1.5">
                Fusion reason codes
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fusionReasonCodes.slice(0, 24).map((c) => (
                  <span
                    key={c}
                    className="text-[10px] px-2 py-0.5 rounded bg-gray-900/80 text-lime-200/75 font-mono"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
          {fusionBreakdown != null && (
            <div>
              <div className="text-[10px] font-semibold text-lime-500/80 uppercase mb-1.5">
                Ranking breakdown
              </div>
              <JsonPayloadViewer data={fusionBreakdown} maxCollapsedHeight={240} />
            </div>
          )}
        </div>
      )}

      {signalChips.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-violet-400 uppercase mb-2">Signals</div>
          <EntityWarningChips items={signalChips} />
        </div>
      )}

      {reasonCodes && reasonCodes.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-violet-400 uppercase mb-2">Reason codes</div>
          <div className="flex flex-wrap gap-1.5">
            {reasonCodes.slice(0, 16).map((c) => (
              <span
                key={c}
                className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-400 font-mono"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {mergeCandidates.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-violet-400 uppercase mb-2">
            Merge candidates
          </div>
          <ul className="space-y-2 text-xs">
            {mergeCandidates.slice(0, 8).map((m) => {
              const toPrimary = hrefFor[mergeEntityType]?.(m.primaryEntityId) ?? "#";
              const toCand = hrefFor[mergeEntityType]?.(m.candidateEntityId) ?? "#";
              return (
                <li
                  key={m.id}
                  className="rounded border border-gray-800 bg-gray-900/40 px-3 py-2 flex flex-wrap gap-2 items-center justify-between"
                >
                  <span className="text-gray-500">
                    {m.level} · {(m.confidence * 100).toFixed(0)}%
                  </span>
                  <span className="text-gray-400">{m.mergeReason}</span>
                  <div className="flex gap-2 w-full justify-end">
                    <Link href={toPrimary} className="text-indigo-400 font-mono">
                      {m.primaryEntityId.slice(0, 10)}…
                    </Link>
                    <span className="text-gray-600">↔</span>
                    <Link href={toCand} className="text-indigo-400 font-mono">
                      {m.candidateEntityId.slice(0, 10)}…
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(inferredOutgoing.length > 0 || inferredIncoming.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InferredList title="Inferred (out)" rows={inferredOutgoing} direction="out" />
          <InferredList title="Inferred (in)" rows={inferredIncoming} direction="in" />
        </div>
      )}

      {breakdownV2 != null && (
        <div>
          <div className="text-[11px] font-semibold text-violet-400 uppercase mb-2">
            Confidence v2
          </div>
          <JsonPayloadViewer data={breakdownV2} maxCollapsedHeight={220} />
        </div>
      )}
    </div>
  );
}

function InferredList({
  title,
  rows,
  direction,
}: {
  title: string;
  rows: InferredRow[];
  direction: "out" | "in";
}) {
  if (!rows.length) {
    return (
      <div className="rounded border border-gray-800/80 bg-gray-900/20 p-3 text-xs text-gray-600">
        {title}: none
      </div>
    );
  }
  return (
    <div className="rounded border border-gray-800/80 overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-800 text-[11px] font-semibold text-gray-500 uppercase">
        {title}
      </div>
      <ul className="divide-y divide-gray-800/60 max-h-56 overflow-y-auto">
        {rows.slice(0, 12).map((r) => {
          const otherType = direction === "out" ? r.toEntityType : r.fromEntityType;
          const otherId = direction === "out" ? r.toEntityId : r.fromEntityId;
          const path = hrefFor[otherType as EntityType]?.(otherId);
          return (
            <li key={r.id} className="px-3 py-2 text-[11px] space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">{otherType}</span>
                <span className="text-gray-600 tabular-nums">
                  {(r.strength * 100).toFixed(0)}%{r.staleAt ? " · stale" : ""}
                </span>
              </div>
              <div className="text-gray-500">{r.sourceReason}</div>
              {path ? (
                <Link href={path} className="text-indigo-400 font-mono truncate block">
                  {otherId}
                </Link>
              ) : (
                <code className="text-gray-600 font-mono truncate block">{otherId}</code>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
