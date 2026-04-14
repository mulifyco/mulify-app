"use client";

import { useState } from "react";
import Link from "next/link";

export default function AddAsLeadButton({
  domain,
  storeId,
  companyName,
  potentialScore,
  tags,
}: {
  domain: string;
  storeId?: string | null;
  companyName?: string | null;
  potentialScore?: number | null;
  tags?: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  const safeDomain = (domain ?? "").trim();

  async function create() {
    if (!safeDomain) {
      setMsg("No domain available.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: safeDomain,
          storeId: storeId ?? undefined,
          companyName: companyName ?? undefined,
          estimatedPotentialScore: potentialScore ?? undefined,
          tags: tags ?? undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json.error ?? "Create lead failed");
      setLeadId(String(json.data?.id ?? ""));
      setMsg("Lead created.");
    } catch (e) {
      const m = e instanceof Error ? e.message : "Failed";
      setMsg(m);
    } finally {
      setBusy(false);
    }
  }

  if (leadId) {
    return (
      <Link href={`/leads/${leadId}`} className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm">
        Open lead →
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={busy || !safeDomain}
      onClick={create}
      className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm disabled:opacity-50"
      title={msg ?? "Create a lead record for outreach"}
    >
      {busy ? "Adding…" : "Add as lead"}
    </button>
  );
}

