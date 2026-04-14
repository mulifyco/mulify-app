"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import EmptyState from "@/components/internal/EmptyState";
import LoadDemoWorkspaceButton from "@/components/launch/LoadDemoWorkspaceButton";

type WatchlistRow = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  _count?: { stores?: number };
};

export default function WatchlistsClient({ initialItems }: { initialItems: WatchlistRow[] }) {
  const [items, setItems] = useState<WatchlistRow[]>(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function refresh() {
    const res = await fetch("/api/watchlists", { cache: "no-store" });
    const json = (await res.json()) as { data?: WatchlistRow[]; error?: string };
    if (res.ok && Array.isArray(json.data)) setItems(json.data);
    router.refresh();
  }

  async function create() {
    const name = prompt("Watchlist name?");
    if (!name) return;
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/watchlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Create failed");
        return;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function rename(id: string, current: string) {
    const name = prompt("Rename watchlist", current);
    if (!name) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/watchlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? "Update failed");
      else await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this watchlist?")) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/watchlists/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) setError(json.error ?? "Delete failed");
      else await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="sticky top-14 z-10 -mx-1 flex flex-col gap-3 border-b border-border bg-background/95 px-1 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:flex-row sm:items-start sm:justify-between sm:border-0 sm:bg-transparent sm:py-0 sm:backdrop-blur-none">
        <p className="text-sm text-muted sm:max-w-2xl">
          Track competitor domains, spike alerts, and side-by-side comparisons — built for weekly client updates.
        </p>
        <button
          type="button"
          onClick={create}
          disabled={busy === "create"}
          className="shrink-0 self-start rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90 disabled:opacity-40"
        >
          New watchlist
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded border border-amber-500/30 bg-card px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="No watchlists yet"
          description="Create a list of competitor domains, run evaluations on a schedule, and open Compare for side-by-side narratives."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <LoadDemoWorkspaceButton label="Load sample watchlist" />
              <button
                type="button"
                onClick={create}
                disabled={busy === "create"}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
              >
                Create your first watchlist
              </button>
            </div>
          }
        />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {items.map((w) => (
              <div key={w.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/watchlists/${w.id}`} className="text-sm font-semibold text-foreground hover:opacity-80">
                      {w.name}
                    </Link>
                    {w.description ? <div className="text-xs text-muted mt-1">{w.description}</div> : null}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{w._count?.stores ?? 0} stores</span>
                </div>
                <div className="mt-2 text-[11px] text-muted-2">Updated {new Date(w.updatedAt).toLocaleString()}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy === w.id}
                    onClick={() => rename(w.id, w.name)}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border hover:bg-surface-2 disabled:opacity-40"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={busy === w.id}
                    onClick={() => remove(w.id)}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border text-red-600 dark:text-red-400 hover:bg-surface-2 disabled:opacity-40"
                  >
                    Delete
                  </button>
                  <Link
                    href={`/watchlists/${w.id}`}
                    className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border text-indigo-600 dark:text-indigo-400 hover:bg-surface-2"
                  >
                    Open →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-left">
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Name</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Stores</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Updated</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase w-56">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((w) => (
                  <tr key={w.id} className="hover:bg-surface-2/60">
                    <td className="px-3 py-2 font-medium text-foreground">
                      <Link href={`/watchlists/${w.id}`} className="hover:opacity-80">
                        {w.name}
                      </Link>
                      {w.description ? <div className="text-xs text-muted mt-0.5">{w.description}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{w._count?.stores ?? 0}</td>
                    <td className="px-3 py-2 text-xs text-muted">{new Date(w.updatedAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          disabled={busy === w.id}
                          onClick={() => rename(w.id, w.name)}
                          className="text-[11px] px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy === w.id}
                          onClick={() => remove(w.id)}
                          className="text-[11px] px-2 py-1 rounded border border-border text-red-600 dark:text-red-400 hover:bg-surface-2 disabled:opacity-40"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

