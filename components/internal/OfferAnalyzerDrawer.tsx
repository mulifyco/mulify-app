"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import { trackClientProductEvent } from "@/lib/analytics/track-client-event";

type OfferAnalyzerPayload = {
  offerStrengthScore: number;
  conversionClarityScore: number;
  pricingAngle: string;
  ctaQuality: string;
  urgencySignals: string[];
  socialProofSignals: string[];
  trustSignals: string[];
  bundleSignals: string[];
  offerSummary: string;
  weaknesses: string[];
  recommendations: string[];
};

function scoreVariant(n: number): "green" | "yellow" | "red" | "default" {
  if (n >= 75) return "green";
  if (n >= 55) return "yellow";
  if (n > 0) return "red";
  return "default";
}

function chips(items: string[]) {
  if (!items.length) return <span className="text-xs text-muted-2">—</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.slice(0, 12).map((x) => (
        <span key={x} className="text-xs px-2 py-1 rounded bg-surface-2 text-foreground border border-border">
          {x}
        </span>
      ))}
    </div>
  );
}

export default function OfferAnalyzerDrawer({
  entityType,
  entityId,
  triggerLabel = "Analyze offer",
  title,
}: {
  entityType: string;
  entityId: string;
  triggerLabel?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<OfferAnalyzerPayload | null>(null);

  useEffect(() => {
    if (!open) return;
    trackClientProductEvent({
      eventType: "OFFER_ANALYZER_OPEN",
      entityType,
      entityId,
      dedupeKey: `${entityType}:${entityId}`,
    });
  }, [open, entityType, entityId]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    fetch(`/api/offer-analyzer?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: OfferAnalyzerPayload; error?: string };
        if (!r.ok) throw new Error(j.error ?? "Analyzer failed");
        return j.data ?? null;
      })
      .then((p) => {
        if (!mounted) return;
        setData(p);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e instanceof Error ? e.message : "Analyzer failed");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [open, entityType, entityId]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setLoading(true);
          setErr(null);
          setData(null);
        }}
        className="text-xs text-indigo-600 hover:opacity-80"
      >
        {triggerLabel}
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-indigo-600 hover:opacity-80">
        {triggerLabel}
      </button>

      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border overflow-y-auto">
          <div className="px-4 py-4 border-b border-border flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted uppercase tracking-wide">Landing / Offer Analyzer</div>
              <div className="text-sm text-foreground truncate">{title ?? `${entityType}:${entityId}`}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs rounded bg-surface-2 text-foreground hover:opacity-90 border border-border"
            >
              Close
            </button>
          </div>

          <div className="p-4 space-y-4">
            {loading ? (
              <div className="text-sm text-muted">Loading…</div>
            ) : err ? (
              <div className="text-sm text-red-600">{err}</div>
            ) : !data ? (
              <div className="text-sm text-muted">No analysis available.</div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">Overall</div>
                    <div className="flex gap-2">
                      <Badge
                        label={`Offer ${Math.round(data.offerStrengthScore)}`}
                        variant={scoreVariant(data.offerStrengthScore)}
                      />
                      <Badge
                        label={`Clarity ${Math.round(data.conversionClarityScore)}`}
                        variant={scoreVariant(data.conversionClarityScore)}
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted">
                    <span className="font-medium text-foreground">Pricing angle:</span> {data.pricingAngle}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    <span className="font-medium text-foreground">CTA:</span> {data.ctaQuality}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Offer summary</div>
                  <div className="text-sm text-foreground">{data.offerSummary}</div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Signals</div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[11px] text-muted uppercase tracking-wide mb-1">Trust</div>
                      {chips(data.trustSignals ?? [])}
                    </div>
                    <div>
                      <div className="text-[11px] text-muted uppercase tracking-wide mb-1">Social proof</div>
                      {chips(data.socialProofSignals ?? [])}
                    </div>
                    <div>
                      <div className="text-[11px] text-muted uppercase tracking-wide mb-1">Urgency</div>
                      {chips(data.urgencySignals ?? [])}
                    </div>
                    <div>
                      <div className="text-[11px] text-muted uppercase tracking-wide mb-1">Bundle / value</div>
                      {chips(data.bundleSignals ?? [])}
                    </div>
                  </div>
                </div>

                {data.weaknesses?.length ? (
                  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Weaknesses</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                      {data.weaknesses.slice(0, 10).map((x, idx) => (
                        <li key={idx}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {data.recommendations?.length ? (
                  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Recommendations</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                      {data.recommendations.slice(0, 12).map((x, idx) => (
                        <li key={idx}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <summary className="text-xs text-muted cursor-pointer hover:opacity-80">Raw analyzer payload</summary>
                  <div className="mt-3">
                    <JsonPayloadViewer data={data} maxCollapsedHeight={420} />
                  </div>
                </details>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

