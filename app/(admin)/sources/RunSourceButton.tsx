"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  sourceId: string;
  sourceName: string;
}

export default function RunSourceButton({ sourceId, sourceName }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleRun() {
    if (!confirm(`Run sync for "${sourceName}"?`)) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/sources/${sourceId}/run`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setResult(`Error: ${data.error}`);
      } else {
        setResult(`Done: ${data.totalNormalized} normalized`);
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
        <span className={`text-xs ${result.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
          {result}
        </span>
      )}
      <button
        onClick={handleRun}
        disabled={loading}
        className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-white"
      >
        {loading ? "Running…" : "Run Sync"}
      </button>
    </div>
  );
}
