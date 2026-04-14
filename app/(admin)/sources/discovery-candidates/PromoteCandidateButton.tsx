"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PromoteCandidateButton({
  candidateId,
  domain,
  disabled,
}: {
  candidateId: string;
  domain: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function onPromote() {
    if (!confirm(`Promote discovery candidate to SHOPIFY_DOMAIN?\n\n${domain}`)) return;

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/sources/discovery-candidates/${candidateId}/promote`, { method: "POST" });
      const ct = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      const parsed: unknown = ct.includes("application/json") && raw ? JSON.parse(raw) : null;
      const data = (parsed && typeof parsed === "object" ? parsed : { error: "Invalid response" }) as {
        ok?: unknown;
        error?: unknown;
        sourceId?: unknown;
        note?: unknown;
      };

      if (!res.ok) {
        setResult(`Error: ${typeof data.error === "string" ? data.error : "Failed"}`);
        return;
      }

      if (data.note === "already_promoted") {
        setResult("Already promoted");
      } else {
        setResult(`Promoted${typeof data.sourceId === "string" ? ` → ${data.sourceId}` : ""}`);
      }
      router.refresh();
    } catch {
      setResult("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      {result && (
        <span className={`text-xs ${result.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>{result}</span>
      )}
      <button
        onClick={onPromote}
        disabled={Boolean(disabled) || loading}
        className="px-3 py-1.5 text-xs bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded text-primary-foreground border border-border shadow-sm"
      >
        {loading ? "Promoting…" : "Promote"}
      </button>
    </div>
  );
}

