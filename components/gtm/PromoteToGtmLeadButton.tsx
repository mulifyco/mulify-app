"use client";

import { useState } from "react";
import Link from "next/link";

export default function PromoteToGtmLeadButton({ crmLeadId }: { crmLeadId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [gtmId, setGtmId] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/gtm/from-crm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ crmLeadId }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; id?: string; merged?: boolean };
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setGtmId(String(j.id ?? ""));
      setMsg(j.merged ? "Merged into existing GTM lead." : "Added to GTM pipeline.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (gtmId) {
    return (
      <Link
        href="/gtm"
        className="px-3 py-1.5 text-xs rounded border border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:opacity-90"
      >
        Open GTM →
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="px-3 py-1.5 text-xs rounded border border-border bg-card hover:bg-surface-2 text-foreground"
      >
        {busy ? "Adding…" : "Add to GTM pipeline"}
      </button>
      {msg ? <span className="text-[10px] text-muted">{msg}</span> : null}
    </span>
  );
}
