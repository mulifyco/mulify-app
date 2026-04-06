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

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Quick actions
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => runFirst("META_ADS", "Meta")}
          className="px-3 py-1.5 text-xs rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
        >
          {busy === "META_ADS" ? "Running…" : "Run Meta sync"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => runFirst("SHOPIFY_STOREFRONT", "Shopify")}
          className="px-3 py-1.5 text-xs rounded bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50"
        >
          {busy === "SHOPIFY_STOREFRONT" ? "Running…" : "Run Shopify sync"}
        </button>
        <Link
          href="/jobs?status=FAILED"
          className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
        >
          Failed jobs
        </Link>
        <Link
          href="/ads?cmax=0.5"
          className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
        >
          Low confidence (ads)
        </Link>
        <Link
          href="/raw-records?status=FAILED"
          className="px-3 py-1.5 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
        >
          Failed raw records
        </Link>
      </div>
      {msg && <p className="text-xs text-gray-400 mt-3">{msg}</p>}
    </div>
  );
}
