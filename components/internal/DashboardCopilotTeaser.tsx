"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AutoActionsBar from "@/components/internal/AutoActionsBar";
import CampaignBriefDrawer from "@/components/internal/CampaignBriefDrawer";

type Hottest = { entityType: string; entityId: string; label: string };

type CopilotPayload = {
  whyNow: string;
  recommendedActions?: string[];
  autoActions?: Array<{ actionType: string; label?: string; context?: Record<string, unknown> }>;
};

export default function DashboardCopilotTeaser({
  hottest,
  hottestBoardHref,
}: {
  hottest: Hottest | null;
  hottestBoardHref: string;
}) {
  const [copilot, setCopilot] = useState<CopilotPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hottest) return;
    let cancelled = false;
    setLoading(true);
    setCopilot(null);
    const q = new URLSearchParams({
      entityType: hottest.entityType,
      entityId: hottest.entityId,
    });
    fetch(`/api/copilot?${q.toString()}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const data = j?.data as CopilotPayload | undefined;
        setCopilot(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setCopilot(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hottest?.entityId, hottest?.entityType]);

  if (!hottest) return null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em]">Copilot · why now</div>
        <Link
          href={hottestBoardHref}
          className="shrink-0 text-xs font-medium rounded-lg border border-border bg-foreground text-background px-3 py-1.5 hover:opacity-90 text-center"
        >
          Open {hottest.label} →
        </Link>
      </div>
      {loading ? (
        <div className="mt-2 text-sm text-muted animate-pulse">Loading insight…</div>
      ) : copilot ? (
        <>
          <div className="mt-1 text-sm text-foreground">
            <span className="font-semibold">{hottest.label}</span>: {copilot.whyNow}
          </div>
          {copilot.recommendedActions?.[0] ? (
            <div className="mt-1 text-sm text-muted">
              <span className="font-medium text-foreground">Suggested next move:</span> {copilot.recommendedActions[0]}
            </div>
          ) : null}
          {copilot.autoActions?.length ? (
            <div className="mt-3">
              <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-2">Act now</div>
              <AutoActionsBar
                entityType={hottest.entityType}
                entityId={hottest.entityId}
                actions={copilot.autoActions.slice(0, 8).map((a) => ({
                  actionType: a.actionType,
                  label: a.label ?? a.actionType,
                  context: a.context,
                }))}
                compact
              />
              <div className="mt-2">
                <CampaignBriefDrawer
                  entityType={hottest.entityType}
                  entityId={hottest.entityId}
                  triggerLabel="Creative brief"
                  title={`Brief · ${hottest.label}`}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-2 text-sm text-muted">No copilot insight available for this item yet.</div>
      )}
    </div>
  );
}
