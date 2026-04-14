"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { BOARD_TYPE_LABELS, BOARD_TYPE_VALUES } from "@/lib/boards/saved-board-filter";
import { formatDate } from "@/lib/date";
import type { BoardType, Platform, SavedBoardFilter } from "@prisma/client";

const PLATFORMS: Platform[] = [
  "FACEBOOK",
  "INSTAGRAM",
  "AUDIENCE_NETWORK",
  "MESSENGER",
  "META",
  "SHOPIFY",
  "TIKTOK",
  "UNKNOWN",
];

type Item = SavedBoardFilter;

interface Props {
  initialItems: Item[];
}

function emptyForm(): {
  name: string;
  boardType: BoardType;
  minScore: string;
  minStores: string;
  maxSaturation: string;
  platform: string;
  isEnabled: boolean;
} {
  return {
    name: "",
    boardType: "READY_TO_SCALE",
    minScore: "",
    minStores: "",
    maxSaturation: "",
    platform: "",
    isEnabled: true,
  };
}

function itemToForm(item: Item) {
  return {
    name: item.name,
    boardType: item.boardType,
    minScore: item.minScore != null ? String(item.minScore) : "",
    minStores: item.minStores != null ? String(item.minStores) : "",
    maxSaturation: item.maxSaturation != null ? String(item.maxSaturation) : "",
    platform: item.platform ?? "",
    isEnabled: item.isEnabled,
  };
}

export default function SavedBoardFiltersClient({ initialItems }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setModalOpen(true);
  }

  function openEdit(item: Item) {
    setEditingId(item.id);
    setForm(itemToForm(item));
    setError(null);
    setModalOpen(true);
  }

  async function refresh() {
    const res = await fetch("/api/boards/saved-filters", { cache: "no-store" });
    const json = (await res.json()) as { items?: Item[]; error?: string };
    if (res.ok && json.items) setItems(json.items);
    router.refresh();
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const minScore =
      form.minScore === "" ? null : Number.isFinite(parseFloat(form.minScore)) ? parseFloat(form.minScore) : null;
    const minStores =
      form.minStores === "" ? null : Number.isFinite(parseInt(form.minStores, 10)) ? parseInt(form.minStores, 10) : null;
    const maxSaturation =
      form.maxSaturation === ""
        ? null
        : Number.isFinite(parseFloat(form.maxSaturation))
          ? parseFloat(form.maxSaturation)
          : null;

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      boardType: form.boardType,
      minScore,
      minStores,
      maxSaturation,
      platform: form.platform === "" ? null : form.platform,
      isEnabled: form.isEnabled,
    };

    const url = editingId ? `/api/boards/saved-filters/${editingId}` : "/api/boards/saved-filters";
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Save failed");
      return;
    }
    setModalOpen(false);
    await refresh();
  }

  async function toggleEnabled(item: Item) {
    setBusyId(item.id);
    const res = await fetch(`/api/boards/saved-filters/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !item.isEnabled }),
    });
    setBusyId(null);
    if (res.ok) await refresh();
  }

  async function remove(id: string) {
    if (!confirm("Delete this saved filter?")) return;
    setBusyId(id);
    const res = await fetch(`/api/boards/saved-filters/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (res.ok) await refresh();
  }

  async function runEvaluate(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/boards/saved-filters/${id}/evaluate`, { method: "POST" });
    setBusyId(null);
    if (res.ok) await refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted max-w-2xl">
          Saved criteria for boards — run evaluation to refresh match counts. Future: alerts and automation on top of
          this layer.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        >
          New filter
        </button>
      </div>

      {error && !modalOpen ? (
        <div className="mb-4 rounded border border-amber-500/30 bg-card px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Name</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Board</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Min score</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Min stores</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Max sat.</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Platform</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Enabled</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase text-right">Matches</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase">Last run</th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase w-48">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-muted">
                  No saved filters yet. Create one to track board thresholds.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="hover:bg-surface-2/50">
                  <td className="px-3 py-2 font-medium text-foreground">{row.name}</td>
                  <td className="px-3 py-2 text-muted">{BOARD_TYPE_LABELS[row.boardType]}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {row.minScore != null ? row.minScore : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {row.minStores != null ? row.minStores : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {row.maxSaturation != null ? row.maxSaturation : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted font-mono">{row.platform ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge label={row.isEnabled ? "On" : "Off"} variant={row.isEnabled ? "green" : "default"} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={`font-medium ${row.lastMatchedCount > 0 ? "text-emerald-600" : "text-foreground"}`}>
                      {row.lastMatchedCount}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {row.lastEvaluatedAt ? (
                      <div className="flex flex-col leading-tight">
                        <span className="text-muted">{formatDate(row.lastEvaluatedAt)}</span>
                        <span className="text-[11px] text-muted-2">Last run</span>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => runEvaluate(row.id)}
                        className="text-[11px] px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-40"
                      >
                        Run
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => toggleEnabled(row)}
                        className="text-[11px] px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-40"
                      >
                        {row.isEnabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => openEdit(row)}
                        className="text-[11px] px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => remove(row.id)}
                        className="text-[11px] px-2 py-1 rounded border border-border text-red-600 dark:text-red-400 hover:bg-surface-2 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-2">
        Open board:{" "}
        <Link href="/boards/ready-to-scale" className="text-indigo-600 dark:text-indigo-400 hover:opacity-80">
          Ready to Scale
        </Link>
        {" · "}
        <Link href="/boards/market-leaders" className="text-indigo-600 dark:text-indigo-400 hover:opacity-80">
          Market Leaders
        </Link>
        {" · "}
        <Link href="/boards/early-movers" className="text-indigo-600 dark:text-indigo-400 hover:opacity-80">
          Early Movers
        </Link>
        {" · "}
        <Link href="/boards/saturated-products" className="text-indigo-600 dark:text-indigo-400 hover:opacity-80">
          Saturated
        </Link>
        {" · "}
        <Link href="/boards/creative-winners" className="text-indigo-600 dark:text-indigo-400 hover:opacity-80">
          Creative Winners
        </Link>
      </p>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default border-0 bg-transparent p-0"
            aria-label="Close dialog"
            onClick={() => setModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card shadow-lg p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit saved filter" : "New saved filter"}
            </h2>
            <form onSubmit={submitForm} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[11px] font-medium text-muted uppercase">Name</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-muted uppercase">Board type</span>
                <select
                  value={form.boardType}
                  onChange={(e) => setForm((f) => ({ ...f, boardType: e.target.value as BoardType }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                >
                  {BOARD_TYPE_VALUES.map((bt) => (
                    <option key={bt} value={bt}>
                      {BOARD_TYPE_LABELS[bt]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-muted uppercase">Min score (optional)</span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.minScore}
                  onChange={(e) => setForm((f) => ({ ...f, minScore: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                  placeholder="e.g. 65"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-muted uppercase">Min stores (optional)</span>
                <input
                  type="number"
                  min={0}
                  value={form.minStores}
                  onChange={(e) => setForm((f) => ({ ...f, minStores: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-muted uppercase">Max saturation (optional)</span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.maxSaturation}
                  onChange={(e) => setForm((f) => ({ ...f, maxSaturation: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                />
              </label>
              {form.boardType === "CREATIVE_WINNERS" ? (
                <label className="block">
                  <span className="text-[11px] font-medium text-muted uppercase">Platform (optional)</span>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground"
                  >
                    <option value="">Any</option>
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.isEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, isEnabled: e.target.checked }))}
                />
                Enabled
              </label>
              {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs rounded-md bg-foreground text-background font-semibold hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
