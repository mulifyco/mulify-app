"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SourceType } from "@/types";

interface SourceRow {
  id: string;
  name: string;
  type: SourceType;
  status: string;
}

export default function DashboardQuickActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadSources(): Promise<SourceRow[]> {
    const res = await fetch("/api/sources?pageSize=50");
    if (!res.ok) throw new Error("Failed to load sources");
    const json = (await res.json()) as { data: SourceRow[] };
    return json.data ?? [];
  }

  async function runFirst(type: SourceType, label: string) {
    setBusy(type);
    setMsg(null);
    try {
      const sources = await loadSources();
      const match = sources.find((s) => s.type === type && s.status === "ACTIVE");
      if (!match) {
        setMsg(`No active ${label} source. Configure one under Sources.`);
        return;
      }
      const res = await fetch(`/api/sources/${match.id}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Sync failed");
        return;
      }
      setMsg(`Sync finished: ${data.totalNormalized ?? 0} normalized`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(null);
    }
  }

  const triageLinks = (
    <>
      <Link
        href="/jobs?status=FAILED"
        className="px-3 py-1.5 text-xs rounded border border-border text-muted hover:bg-surface-2"
      >
        Failed jobs
      </Link>
      <Link
        href="/ads?cmax=0.5"
        className="px-3 py-1.5 text-xs rounded border border-border text-muted hover:bg-surface-2"
      >
        Low confidence (ads)
      </Link>
      <Link
        href="/raw-records?status=FAILED"
        className="px-3 py-1.5 text-xs rounded border border-border text-muted hover:bg-surface-2"
      >
        Failed raw records
      </Link>
    </>
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        Quick actions
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => runFirst("META_ADS", "Meta")}
          className="px-3 py-1.5 text-xs rounded bg-primary hover:opacity-90 text-primary-foreground disabled:opacity-50 border border-border"
        >
          {busy === "META_ADS" ? "Running…" : "Run Meta sync"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => runFirst("SHOPIFY_STOREFRONT", "Shopify")}
          className="px-3 py-1.5 text-xs rounded bg-surface-2 hover:opacity-90 text-foreground disabled:opacity-50 border border-border"
        >
          {busy === "SHOPIFY_STOREFRONT" ? "Running…" : "Run Shopify sync"}
        </button>
        <div className="hidden sm:contents">{triageLinks}</div>
      </div>
      <details className="sm:hidden mt-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted list-none flex items-center justify-between gap-2">
          <span>Triage & quality</span>
          <span className="text-muted-2" aria-hidden>
            ▾
          </span>
        </summary>
        <div className="flex flex-wrap gap-2 pt-3">{triageLinks}</div>
      </details>
      {msg && <p className="text-xs text-muted mt-3">{msg}</p>}
    </div>
  );
}
