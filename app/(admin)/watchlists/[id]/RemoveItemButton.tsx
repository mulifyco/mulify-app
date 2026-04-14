"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RemoveItemButton({
  watchlistId,
  itemId,
  domain,
}: {
  watchlistId: string;
  itemId: string;
  domain: string;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function remove() {
    if (!confirm(`Remove from watchlist?\n\n${domain}`)) return;
    setBusy(true);
    try {
      await fetch(`/api/watchlists/${watchlistId}/stores/${itemId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="text-[11px] px-2 py-1 rounded border border-border text-red-600 dark:text-red-400 hover:bg-surface-2 disabled:opacity-40"
    >
      {busy ? "Removing…" : "Remove"}
    </button>
  );
}

