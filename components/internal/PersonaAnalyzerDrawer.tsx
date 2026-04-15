"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import { trackClientProductEvent } from "@/lib/analytics/track-client-event";

type PersonaAnalyzerPayload = {
  primaryPersona: string;
  secondaryPersonas: string[];
  awarenessStage: string;
  buyingIntent: string;
  corePainPoints: string[];
  emotionalTriggers: string[];
  rationalTriggers: string[];
  bestCreativeAngles: string[];
  messagingWarnings: string[];
  audienceSummary: string;
};

function variantForIntent(intent: string): "purple" | "green" | "yellow" | "default" {
  if (intent === "IMPULSE") return "purple";
  if (intent === "RESEARCH") return "green";
  if (intent === "CONSIDERATION") return "yellow";
  return "default";
}

export default function PersonaAnalyzerDrawer({
  entityType,
  entityId,
  triggerLabel = "Analyze audience",
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
  const [data, setData] = useState<PersonaAnalyzerPayload | null>(null);

  useEffect(() => {
    if (!open) return;
    trackClientProductEvent({
      eventType: "PERSONA_ANALYZER_OPEN",
      entityType,
      entityId,
      dedupeKey: `${entityType}:${entityId}`,
    });
  }, [open, entityType, entityId]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    fetch(`/api/persona-analyzer?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: PersonaAnalyzerPayload; error?: string };
        if (!r.ok) throw new Error(j.error ?? "Persona analysis failed");
        return j.data ?? null;
      })
      .then((p) => {
        if (!mounted) return;
        setData(p);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e instanceof Error ? e.message : "Persona analysis failed");
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
              <div className="text-xs text-muted uppercase tracking-wide">Audience / Persona Analyzer</div>
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
              <div className="text-sm text-muted">No persona analysis available.</div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">Primary persona</div>
                      <div className="text-sm font-semibold text-foreground">{data.primaryPersona}</div>
                      <div className="mt-1 text-xs text-muted">{data.audienceSummary}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge label={data.buyingIntent} variant={variantForIntent(data.buyingIntent)} />
                      <Badge label={data.awarenessStage.replaceAll("_", " ")} variant="default" />
                    </div>
                  </div>
                  {data.secondaryPersonas?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {data.secondaryPersonas.slice(0, 3).map((p) => (
                        <span key={p} className="text-xs px-2 py-1 rounded bg-surface-2 text-foreground border border-border">
                          {p}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Pain points</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                      {(data.corePainPoints ?? []).slice(0, 6).map((x, idx) => (
                        <li key={idx}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Best angles</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                      {(data.bestCreativeAngles ?? []).slice(0, 6).map((x, idx) => (
                        <li key={idx}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Triggers</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-[11px] text-muted uppercase tracking-wide mb-1">Emotional</div>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                        {(data.emotionalTriggers ?? []).slice(0, 6).map((x, idx) => (
                          <li key={idx}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted uppercase tracking-wide mb-1">Rational</div>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                        {(data.rationalTriggers ?? []).slice(0, 6).map((x, idx) => (
                          <li key={idx}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {data.messagingWarnings?.length ? (
                  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Messaging risks</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                      {data.messagingWarnings.slice(0, 8).map((x, idx) => (
                        <li key={idx}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <summary className="text-xs text-muted cursor-pointer hover:opacity-80">Raw persona payload</summary>
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

