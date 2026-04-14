"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoadDemoWorkspaceButton({
  label = "Load sample workspace",
  className = "px-3 py-1.5 text-xs rounded-lg border border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20",
}: {
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/launch/demo-seed", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button type="button" disabled={busy} onClick={() => void run()} className={className}>
        {busy ? "Loading…" : label}
      </button>
      {err ? <span className="text-[10px] text-red-600">{err}</span> : null}
    </span>
  );
}
