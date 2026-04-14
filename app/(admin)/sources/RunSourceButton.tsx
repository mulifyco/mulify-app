"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  sourceId: string;
  sourceName: string;
  disabled?: boolean;
  disabledReason?: string;
}

export default function RunSourceButton({ sourceId, sourceName, disabled, disabledReason }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleRun() {
    if (!confirm(`Run sync for "${sourceName}"?`)) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/sources/${sourceId}/run`, { method: "POST" });
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      const parsed: unknown = ct.includes("application/json") && raw ? JSON.parse(raw) : null;
      const data = (parsed && typeof parsed === "object" ? parsed : { error: "Veri alınamadı" }) as {
        error?: unknown;
        totalNormalized?: unknown;
        ok?: unknown;
        code?: unknown;
        message?: unknown;
      };

      if (!res.ok) {
        if (data?.code === "DISCOVERY_ONLY_SOURCE") {
          setResult("Bu source tipi doğrudan çalıştırılamaz. Discovery phase ile işlenir.");
        } else {
          setResult(`Error: ${typeof data?.error === "string" ? data.error : "Veri alınamadı"}`);
        }
      } else {
        if (data?.ok === false && data?.code === "DISCOVERY_ONLY_SOURCE") {
          setResult("Bu source tipi doğrudan çalıştırılamaz. Discovery phase ile işlenir.");
          return;
        }
        const n = typeof data.totalNormalized === "number" ? data.totalNormalized : 0;
        setResult(`Done: ${n} normalized`);
        router.refresh();
      }
    } catch {
      setResult("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className={`text-xs ${result.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
          {result}
        </span>
      )}
      <button
        onClick={handleRun}
        disabled={Boolean(disabled) || loading}
        title={disabledReason ?? undefined}
        className="px-3 py-1.5 text-xs bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded text-primary-foreground border border-border shadow-sm"
      >
        {loading ? "Running…" : "Run Sync"}
      </button>
    </div>
  );
}
