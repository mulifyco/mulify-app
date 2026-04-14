"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetReliabilityButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sources/${sourceId}/reliability/reset`, { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Reset failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className="text-xs px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "Resetting…" : "Reset reliability"}
      </button>
      {err ? <span className="text-[11px] text-red-600">{err}</span> : null}
    </div>
  );
}
