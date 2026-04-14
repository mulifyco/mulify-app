"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import { trackClientProductEvent } from "@/lib/analytics/track-client-event";

type ExplainPayload = {
  summary: string;
  reasons: string[];
  supportingSignals: Array<{ label: string; value: string | number | null }>;
  confidence: number;
  recommendedAction?: string;
};

export default function ExplainDrawer({
  entityType,
  entityId,
  triggerLabel = "Why?",
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
  const [data, setData] = useState<ExplainPayload | null>(null);

  useEffect(() => {
    if (!open) return;
    trackClientProductEvent({
      eventType: "BOARD_ITEM_OPEN",
      entityType,
      entityId,
      dedupeKey: `${entityType}:${entityId}`,
    });
  }, [open, entityType, entityId]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    setErr(null);
    setData(null);
    fetch(`/api/explain?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as any;
        if (!r.ok) throw new Error(j.error ?? "Explain failed");
        return j.data as ExplainPayload;
      })
      .then((p) => {
        if (!mounted) return;
        setData(p);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e instanceof Error ? e.message : "Explain failed");
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
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-600 hover:opacity-80"
      >
        {triggerLabel}
      </button>
    );
  }

  const confPct = data ? Math.round((data.confidence ?? 0) * 100) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-600 hover:opacity-80"
      >
        {triggerLabel}
      </button>

      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border overflow-y-auto">
          <div className="px-4 py-4 border-b border-border flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted uppercase tracking-wide">Explainability</div>
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
              <div className="text-sm text-muted">No explanation available.</div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">{data.summary}</div>
                    {confPct != null && <Badge label={`${confPct}%`} variant={confPct >= 80 ? "green" : confPct >= 60 ? "yellow" : "default"} />}
                  </div>
                  {data.recommendedAction && (
                    <div className="mt-2 text-sm text-muted">
                      <span className="font-medium text-foreground">What to do next:</span>{" "}
                      {data.recommendedAction}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Why this matters</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                    {data.reasons.map((r, idx) => (
                      <li key={idx}>{r}</li>
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
                  <summary className="text-xs text-muted cursor-pointer hover:opacity-80">
                    Raw explanation payload
                  </summary>
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

