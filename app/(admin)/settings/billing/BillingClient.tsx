"use client";

import { useState } from "react";

export default function BillingClient({ stripeConfigured }: { stripeConfigured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function openPortal() {
    if (!stripeConfigured) {
      setMsg("Stripe is not configured on this environment.");
      return;
    }
    setBusy(true);
    setMsg(null);
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

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        type="button"
        disabled={busy}
        onClick={openPortal}
        className="px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 border border-border"
      >
        {busy ? "Opening…" : "Manage billing"}
      </button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </div>
  );
}

