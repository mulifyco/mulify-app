"use client";

import { useEffect, useState } from "react";

type WsRow = { workspaceId: string; name: string; billingPlan: string; role: string; demo?: boolean };

function planBadgeClass(plan: string): string {
  const p = plan.toUpperCase();
  if (p === "TEAM") return "bg-violet-500/15 text-violet-200 border-violet-500/30";
  if (p === "PRO") return "bg-sky-500/15 text-sky-200 border-sky-500/30";
  return "bg-zinc-500/10 text-muted border-border";
}

export default function WorkspaceSwitcher({ compact }: { compact?: boolean }) {
  const [rows, setRows] = useState<WsRow[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/workspaces", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          data?: WsRow[];
          activeWorkspaceId?: string | null;
        };
        setRows(Array.isArray(json.data) ? json.data : []);
        setActiveId(typeof json.activeWorkspaceId === "string" ? json.activeWorkspaceId : "");
      } catch {
        setRows([]);
      }
    })();
  }, []);

  async function switchWs(next: string) {
    if (next === activeId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/settings/workspaces/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: next }),
      });
      if (!res.ok) return;
      setActiveId(next);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) return null;

  const active = rows.find((r) => r.workspaceId === activeId) ?? rows[0];

  return (
    <div className={compact ? "" : "mt-4 pt-3 border-t border-border/80"}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.2em]">Workspace</span>
        {rows.length > 1 ? (
          <span className="text-[9px] text-muted tabular-nums">{rows.length} available</span>
        ) : null}
      </div>
      {rows.length === 1 ? (
        <div className="rounded-lg border border-border bg-surface-2/60 px-2.5 py-2">
          <div className="text-xs font-medium text-foreground truncate" title={active.name}>
            {active.name}
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${planBadgeClass(active.billingPlan)}`}>
              {active.billingPlan}
            </span>
            {active.demo ? (
              <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-amber-500/10 text-amber-200 border-amber-500/30">
                DEMO
              </span>
            ) : null}
            <span className="text-[9px] text-muted uppercase tracking-wide">{active.role}</span>
          </div>
        </div>
      ) : (
        <select
          value={activeId && rows.some((r) => r.workspaceId === activeId) ? activeId : rows[0]?.workspaceId}
          disabled={busy}
          onChange={(e) => switchWs(e.target.value)}
          aria-label="Switch workspace"
          className="w-full appearance-none rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50"
        >
          {rows.map((r) => (
            <option key={r.workspaceId} value={r.workspaceId}>
              {r.name} · {r.role} · {r.billingPlan}
              {r.demo ? " · DEMO" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
