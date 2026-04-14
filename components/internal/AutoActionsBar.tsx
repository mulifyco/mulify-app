"use client";

import { useState } from "react";
type AutoActionResponse = { ok: boolean; redirectUrl?: string; createdId?: string; message: string };

export default function AutoActionsBar({
  entityType,
  entityId,
  actions,
  compact = false,
}: {
  entityType: string;
  entityId: string;
  actions: Array<{ label: string; actionType: string; context?: Record<string, unknown> }>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(a: { label: string; actionType: string; context?: Record<string, unknown> }) {
    setBusy(a.actionType);
    setMsg(null);
    try {
      const res = await fetch("/api/auto-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType, entityId, actionType: a.actionType, context: a.context ?? undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<AutoActionResponse>;
      if (!res.ok || !json.ok) throw new Error(json.message ?? "Action failed");
      setMsg(json.message ?? "Done.");
      if (json.redirectUrl) window.location.assign(json.redirectUrl);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {actions.map((a) => (
        <button
          key={a.actionType}
          type="button"
          onClick={() => run(a)}
          disabled={busy != null}
          className={
            compact
              ? "px-2 py-1 text-xs rounded border border-border hover:bg-surface-2 disabled:opacity-50"
              : "px-2.5 py-1.5 text-xs rounded border border-border hover:bg-surface-2 disabled:opacity-50"
          }
        >
          {busy === a.actionType ? "Working…" : a.label}
        </button>
      ))}
      {msg ? (
        <span className="text-xs text-muted inline-flex items-center gap-2">
          {msg}
        </span>
      ) : null}
    </div>
  );
}

