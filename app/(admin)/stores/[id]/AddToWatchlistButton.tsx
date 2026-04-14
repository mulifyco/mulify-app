"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type WatchlistRow = { id: string; name: string };

export default function AddToWatchlistButton({ domain }: { domain: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WatchlistRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch("/api/watchlists?pageSize=200", { cache: "no-store" });
        const json = (await res.json()) as { data?: Array<{ id: string; name: string }> };
        const wl = Array.isArray(json.data) ? json.data.map((x) => ({ id: x.id, name: x.name })) : [];
        setItems(wl);
        setSelected(wl[0]?.id ?? "");
      } catch {
        setItems([]);
      }
    })();
  }, [open]);

  async function add() {
    if (!selected) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/watchlists/${selected}/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setResult(`Error: ${json.error ?? "Failed"}`);
        return;
      }
      setResult("Added");
      router.refresh();
    } catch {
      setResult("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm"
      >
        Add to watchlist
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-border bg-card shadow-lg p-3 z-20">
          <div className="text-[11px] text-muted uppercase font-semibold mb-2">Watchlist</div>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full bg-surface border border-border rounded px-2 py-1.5 text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
          >
            {items.length === 0 ? <option value="">No watchlists</option> : null}
            {items.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={add}
              disabled={!selected || busy}
              className="px-3 py-1.5 text-xs bg-primary hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded text-primary-foreground border border-border shadow-sm"
            >
              {busy ? "Adding…" : "Add"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted hover:opacity-80">
              Close
            </button>
          </div>
          {result ? (
            <div className={`mt-2 text-xs ${result.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
              {result}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

