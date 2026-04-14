"use client";

import { useEffect, useState } from "react";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import { trackClientProductEvent } from "@/lib/analytics/track-client-event";

type CampaignBriefPayload = {
  productAngle: string;
  winningHook: string;
  audienceHypothesis: string;
  offerIdea: string;
  landingPageDirection: string;
  creativeFormats: string[];
  riskNotes: string[];
  testIdeas: string[];
};

type PersonaAnalyzerPayload = {
  primaryPersona: string;
  secondaryPersonas: string[];
  awarenessStage: string;
  buyingIntent: string;
  audienceSummary: string;
  bestCreativeAngles: string[];
};

export default function CampaignBriefDrawer({
  entityType,
  entityId,
  triggerLabel = "Creative brief",
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
  const [data, setData] = useState<CampaignBriefPayload | null>(null);
  const [persona, setPersona] = useState<PersonaAnalyzerPayload | null>(null);

  useEffect(() => {
    if (!open) return;
    trackClientProductEvent({
      eventType: "BRIEF_OPEN",
      entityType,
      entityId,
      dedupeKey: `${entityType}:${entityId}`,
    });
  }, [open, entityType, entityId]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    Promise.all([
      fetch(`/api/campaign-brief?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`),
      fetch(`/api/persona-analyzer?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`).catch(
        () => null
      ),
    ])
      .then(async (r) => {
        const briefRes = r[0];
        const briefJson = (await briefRes.json().catch(() => ({}))) as { data?: CampaignBriefPayload; error?: string };
        if (!briefRes.ok) throw new Error(briefJson.error ?? "Brief failed");
        const pRes = r[1];
        if (pRes) {
          const pJson = (await pRes.json().catch(() => ({}))) as { data?: PersonaAnalyzerPayload };
          if (mounted) setPersona(pJson.data ?? null);
        } else if (mounted) {
          setPersona(null);
        }
        return briefJson.data ?? null;
      })
      .then((p) => {
        if (!mounted) return;
        setData(p);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e instanceof Error ? e.message : "Brief failed");
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
              <div className="text-xs text-muted uppercase tracking-wide">Campaign / Creative Brief</div>
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
              <div className="text-sm text-muted">No brief available.</div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Product angle</div>
                  <div className="text-sm text-foreground">{data.productAngle}</div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Winning hook</div>
                  <div className="text-sm text-foreground">{data.winningHook}</div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Audience hypothesis</div>
                  <div className="text-sm text-foreground">
                    {persona ? (
                      <>
                        <div className="font-semibold">{persona.primaryPersona}</div>
                        <div className="text-xs text-muted mt-1">
                          {persona.awarenessStage.replaceAll("_", " ").toLowerCase()} · intent {persona.buyingIntent.toLowerCase()}
                        </div>
                        <div className="mt-2">{persona.audienceSummary}</div>
                        {persona.bestCreativeAngles?.[0] ? (
                          <div className="mt-2 text-xs text-muted">
                            <span className="font-medium text-foreground">Best angle:</span> {persona.bestCreativeAngles[0]}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      data.audienceHypothesis
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Offer idea</div>
                  <div className="text-sm text-foreground">{data.offerIdea}</div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Landing direction</div>
                  <div className="text-sm text-foreground">{data.landingPageDirection}</div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Creative format ideas</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                    {(data.creativeFormats ?? []).slice(0, 10).map((x, idx) => (
                      <li key={idx}>{x}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Test matrix</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                    {(data.testIdeas ?? []).slice(0, 12).map((x, idx) => (
                      <li key={idx}>{x}</li>
                    ))}
                  </ul>
                </div>

                {data.riskNotes?.length ? (
                  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Risk notes</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
                      {data.riskNotes.map((x, idx) => (
                        <li key={idx}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <summary className="text-xs text-muted cursor-pointer hover:opacity-80">Raw brief payload</summary>
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

