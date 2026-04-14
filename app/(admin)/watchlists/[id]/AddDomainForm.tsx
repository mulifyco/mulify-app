"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddDomainForm({ watchlistId }: { watchlistId: string }) {
  const [domain, setDomain] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), label: label.trim() || null }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to add");
        return;
      }
      setDomain("");
      setLabel("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Domain</span>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          className="w-64 bg-surface border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-muted">Label (optional)</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Competitor A"
          className="w-56 bg-surface border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !domain.trim()}
        className="px-3 py-1.5 text-xs bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded text-primary-foreground border border-border shadow-sm"
      >
        {busy ? "Adding…" : "Add"}
      </button>
      {error ? <span className="text-xs text-red-600 ml-2">{error}</span> : null}
    </form>
  );
}

