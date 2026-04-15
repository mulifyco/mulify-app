"use client";

import { useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import { trackClientProductEvent } from "@/lib/analytics/track-client-event";

type HookIntelRow = {
  canonicalHook: string;
  angleType: string;
  totalMentions24h: number;
  storeCount: number;
  platformWins: Array<{ platform: string; mentions: number }>;
  offerMatches: Array<{ offer: string; mentions: number }>;
  persona: {
    awarenessStage: string;
    buyingIntent: string;
    emotionalTrigger: string;
    rationalTrigger: string;
  };
};

type HookIntelPayload = { hooks: HookIntelRow[] };

function angleBadgeVariant(angle: string): "default" | "blue" | "purple" | "green" | "yellow" | "red" {
  if (angle === "urgency") return "red";
  if (angle === "social_proof") return "green";
  if (angle === "trend_viral") return "purple";
  if (angle === "pain") return "yellow";
  return "default";
}

export default function HookIntelligenceDrawer({
  entityType,
  entityId,
  triggerLabel = "Hooks",
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
  const [data, setData] = useState<HookIntelPayload | null>(null);

  useEffect(() => {
    if (!open) return;
    trackClientProductEvent({
      eventType: "CTA_CLICK",
      entityType,
      entityId,
      dedupeKey: `${entityType}:${entityId}`,
      metadata: { kind: "hook_intel_open" },
    });
  }, [open, entityType, entityId]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    fetch(`/api/hook-intelligence?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`)
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { data?: HookIntelPayload; error?: string };
        if (!r.ok) throw new Error(j.error ?? "Hook intelligence failed");
        return j.data ?? null;
      })
      .then((p) => {
        if (!mounted) return;
        setData(p);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e instanceof Error ? e.message : "Hook intelligence failed");
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [open, entityType, entityId]);

  const top = useMemo(() => (data?.hooks ?? []).slice(0, 10), [data]);

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
        <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-background border-l border-border overflow-y-auto">
          <div className="px-4 py-4 border-b border-border flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted uppercase tracking-wide">Winning Hook Intelligence</div>
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
              <div className="text-sm text-muted">No hook intelligence available.</div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">Top winning hooks (24h)</div>
                    <div className="text-xs text-muted">{data.hooks?.length ?? 0} canonical hooks</div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {top.length ? (
                      top.map((h) => (
                        <div key={h.canonicalHook} className="rounded border border-border bg-surface-2 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm text-foreground font-medium break-words">{h.canonicalHook}</div>
                              <div className="mt-1 text-xs text-muted">
                                Persona: <span className="text-foreground">{h.persona.emotionalTrigger}</span> ·{" "}
                                <span className="text-foreground">{h.persona.rationalTrigger}</span> · stage{" "}
                                <span className="text-foreground">{h.persona.awarenessStage}</span> · intent{" "}
                                <span className="text-foreground">{h.persona.buyingIntent}</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <Badge label={String(h.angleType).replace(/_/g, " ")} variant={angleBadgeVariant(h.angleType)} />
                              <div className="text-[11px] text-muted">
                                {h.totalMentions24h} mentions · {h.storeCount} stores
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {(h.platformWins ?? []).slice(0, 4).map((p) => (
                              <span
                                key={`${h.canonicalHook}:${p.platform}`}
                                className="text-[11px] px-2 py-1 rounded bg-background text-foreground border border-border"
                              >
                                {p.platform}: {p.mentions}
                              </span>
                            ))}
                            {(h.offerMatches ?? []).slice(0, 3).map((o) => (
                              <span
                                key={`${h.canonicalHook}:${o.offer}`}
                                className="text-[11px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/25"
                              >
                                offer:{o.offer} · {o.mentions}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted">No hooks found for this entity.</div>
                    )}
                  </div>
                </div>

                <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <summary className="text-xs text-muted cursor-pointer hover:opacity-80">Raw hook payload</summary>
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

