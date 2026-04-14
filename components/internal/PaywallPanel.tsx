"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import Badge from "@/components/ui/Badge";
import { trackClientProductEvent } from "@/lib/analytics/track-client-event";
import type { FeatureId, PlanId } from "@/lib/billing/plans";
import { PLANS } from "@/lib/billing/plans";

export default function PaywallPanel({
  feature,
  currentPlan,
  title,
  description,
}: {
  feature: FeatureId;
  currentPlan: PlanId;
  title: string;
  description: string;
}) {
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackClientProductEvent({
      eventType: "PAYWALL_HIT",
      metadata: { feature, currentPlan },
      dedupeKey: feature,
    });
  }, [feature, currentPlan]);

  const plan = PLANS[currentPlan];
  const pro = PLANS.PRO;
  const team = PLANS.TEAM;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.18em]">Upgrade required</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{title}</div>
          <div className="mt-2 text-sm text-muted leading-relaxed max-w-2xl">{description}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge label={`Current: ${plan.label}`} variant="default" />
            <Badge label={`Unlock: ${feature}`} variant="purple" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/pricing"
            className="px-3 py-1.5 text-xs rounded bg-foreground text-background hover:opacity-90"
          >
            View pricing →
          </Link>
          <div className="hidden lg:block text-right text-xs text-muted">
            <div>Recommended</div>
            <div className="text-foreground font-semibold">{currentPlan === "PRO" ? team.label : pro.label}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

