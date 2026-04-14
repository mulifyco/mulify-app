"use client";

import { useState } from "react";
import { trackPricingCtaClick, trackTrialIntentFromPricing } from "@/lib/analytics/pricing-track";

type PlanId = "FREE" | "PRO" | "TEAM";

export default function PricingActions({
  currentPlan,
  targetPlan,
}: {
  currentPlan: PlanId;
  targetPlan?: PlanId;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function checkout(plan: PlanId) {
    setBusy(true);
    setMsg(null);
    trackPricingCtaClick(`checkout_click_${plan}`);
    if (plan === "PRO" || plan === "TEAM") trackTrialIntentFromPricing(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json.redirectUrl) throw new Error(json.error ?? "Checkout failed");
      window.location.assign(String(json.redirectUrl));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function portal() {
    setBusy(true);
    setMsg(null);
    trackPricingCtaClick("billing_portal_click");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !json.redirectUrl) throw new Error(json.error ?? "Portal failed");
      window.location.assign(String(json.redirectUrl));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!targetPlan) {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={portal}
          className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Opening…" : "Manage billing"}
        </button>
        {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      </div>
    );
  }

  const disabled = busy || targetPlan === currentPlan;
  const label =
    targetPlan === currentPlan
      ? "Current plan"
      : targetPlan === "PRO"
        ? "Upgrade to Pro"
        : targetPlan === "TEAM"
          ? "Upgrade to Team"
          : "Select";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        disabled={disabled}
        onClick={() => checkout(targetPlan)}
        className={`inline-flex px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors disabled:opacity-50 ${
          targetPlan === currentPlan
            ? "border-border text-muted bg-card/60 cursor-default"
            : "border-indigo-500/35 bg-indigo-500/12 text-indigo-200 hover:bg-indigo-500/22"
        }`}
      >
        {busy ? "Redirecting…" : label}
      </button>
      {currentPlan !== "FREE" ? (
        <button
          type="button"
          disabled={busy}
          onClick={portal}
          className="inline-flex px-3 py-1.5 text-xs font-semibold rounded-xl border border-border text-muted hover:text-foreground hover:bg-surface-2/60 disabled:opacity-50 transition-colors"
        >
          Manage billing
        </button>
      ) : null}
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </div>
  );
}

