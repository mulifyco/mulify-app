"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import { trackClientProductEvent } from "@/lib/analytics/track-client-event";
import AutoActionsBar from "@/components/internal/AutoActionsBar";
import OfferAnalyzerDrawer from "@/components/internal/OfferAnalyzerDrawer";
import CampaignBriefDrawer from "@/components/internal/CampaignBriefDrawer";
import PersonaAnalyzerDrawer from "@/components/internal/PersonaAnalyzerDrawer";
import HookIntelligenceDrawer from "@/components/internal/HookIntelligenceDrawer";

type CopilotPayload = {
  summary: string;
  opportunityLevel: "BREAKOUT" | "STRONG" | "WATCH" | "WEAK";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  whyNow: string;
  businessOpportunity?: string;
  recommendedActions: string[];
  autoActions?: Array<{ label: string; actionType: string; context?: Record<string, unknown> }>;
  supportingSignals: Array<{ label: string; value: string | number | null }>;
  warnings: string[];
};

function levelVariant(level: string): "green" | "yellow" | "red" | "purple" | "default" {
  if (level === "BREAKOUT") return "purple";
  if (level === "STRONG") return "green";
  if (level === "WATCH") return "yellow";
  if (level === "HIGH") return "red";
  if (level === "MEDIUM") return "yellow";
  if (level === "LOW") return "green";
  return "default";
}

export default function CopilotDrawer({
  entityType,
  entityId,
  triggerLabel = "Copilot",
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
  const [data, setData] = useState<CopilotPayload | null>(null);

  useEffect(() => {
    if (!open) return;
    trackClientProductEvent({
      eventType: "COPILOT_OPEN",
      entityType,
      entityId,
      dedupeKey: `${entityType}:${entityId}`,
    });
  }, [open, entityType, entityId]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    fetch(`/api/copilot?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: CopilotPayload; error?: string };
        if (!r.ok) throw new Error(j.error ?? "Copilot failed");
        return j.data ?? null;
      })
      .then((p) => {
        if (!mounted) return;
        setData(p);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e instanceof Error ? e.message : "Copilot failed");
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
              <div className="text-xs text-muted uppercase tracking-wide">AI Opportunity Copilot</div>
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
              <div className="text-sm text-muted">No copilot insight available.</div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">{data.summary}</div>
                    <div className="flex gap-2">
                      <Badge label={data.opportunityLevel} variant={levelVariant(data.opportunityLevel)} />
                      <Badge label={`Risk ${data.riskLevel}`} variant={levelVariant(data.riskLevel)} />
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-muted">
                    <span className="font-medium text-foreground">Why now:</span> {data.whyNow}
                  </div>
                  {data.businessOpportunity ? (
                    <div className="mt-2 text-sm text-muted">
                      <span className="font-medium text-foreground">Business opportunity:</span> {data.businessOpportunity}
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <CampaignBriefDrawer
                      entityType={entityType}
                      entityId={entityId}
                      triggerLabel="Generate brief"
                      title={title ?? `${entityType}:${entityId}`}
                    />
                    <OfferAnalyzerDrawer
                      entityType={entityType}
                      entityId={entityId}
                      triggerLabel="Analyze offer"
                      title={title ?? `${entityType}:${entityId}`}
                    />
                    <PersonaAnalyzerDrawer
                      entityType={entityType}
                      entityId={entityId}
                      triggerLabel="Analyze audience"
                      title={title ?? `${entityType}:${entityId}`}
                    />
                    <HookIntelligenceDrawer
                      entityType={entityType}
                      entityId={entityId}
                      triggerLabel="Hooks"
                      title={title ?? `${entityType}:${entityId}`}
                    />
                  </div>
                </div>

                {data.warnings?.length ? (
                  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Warnings</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                      {data.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Suggested next moves</div>
                  {data.autoActions?.length ? (
                    <div className="mb-3">
                      <AutoActionsBar entityType={entityType} entityId={entityId} actions={data.autoActions.slice(0, 10)} />
                    </div>
                  ) : null}
                  <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                    {(data.recommendedActions ?? []).slice(0, 6).map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Supporting signals</div>
                  <div className="grid grid-cols-2 gap-2">
                    {data.supportingSignals.map((s) => (
                      <div key={s.label} className="rounded border border-border bg-background px-3 py-2">
                        <div className="text-[10px] text-muted uppercase tracking-wide">{s.label}</div>
                        <div className="text-sm text-foreground tabular-nums">{s.value ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <summary className="text-xs text-muted cursor-pointer hover:opacity-80">Raw copilot payload</summary>
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

