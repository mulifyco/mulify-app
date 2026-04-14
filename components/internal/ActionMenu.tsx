"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type ActionContext = {
  // canonical
  entityType?: "PRODUCT_CLUSTER" | "CREATIVE_CLUSTER" | "DISCOVERY_CANDIDATE" | "WATCHLIST_ALERT" | "DOMAIN";
  entityId?: string;

  // optional helpers
  domain?: string;
  watchlistId?: string;
  candidateId?: string;
  sourceId?: string;
  boardType?: "READY_TO_SCALE" | "MARKET_LEADERS" | "EARLY_MOVERS" | "SATURATED_PRODUCTS" | "CREATIVE_WINNERS";
  label?: string;
};

function menuItemClass(disabled?: boolean) {
  return `block w-full text-left px-3 py-2 text-sm ${
    disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-2"
  }`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ActionMenu({
  ctx,
  compact = true,
  align = "right",
}: {
  ctx: ActionContext;
  compact?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [watchlists, setWatchlists] = useState<Array<{ id: string; name: string }> | null>(null);
  const [watchlistId, setWatchlistId] = useState<string>("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const entityType = ctx.entityType ?? (ctx.candidateId ? "DISCOVERY_CANDIDATE" : undefined);
  const entityId = ctx.entityId ?? ctx.candidateId ?? "";

  const deepLink = useMemo(() => {
    if (!entityType || !entityId) return null;
    return `${window.location.origin}/api/explain?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`;
  }, [entityType, entityId]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function ensureWatchlists() {
    if (watchlists) return;
    try {
      const res = await fetch("/api/watchlists?pageSize=200", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as any;
      const rows = Array.isArray(json.data) ? json.data : [];
      const wl = rows.map((r: any) => ({ id: r.id, name: r.name }));
      setWatchlists(wl);
      if (wl[0]?.id) setWatchlistId(wl[0].id);
    } catch {
      setWatchlists([]);
    }
  }

  async function addToWatchlist() {
    const domain = (ctx.domain ?? "").trim();
    if (!domain) {
      setMsg("No domain available for watchlist.");
      return;
    }
    await ensureWatchlists();
    if (!watchlistId) {
      setMsg("No watchlist selected.");
      return;
    }
    setBusy("watchlist");
    setMsg(null);
    try {
      const res = await fetch(`/api/watchlists/${watchlistId}/stores`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json.error ?? "Failed to add to watchlist");
      setMsg("Added to watchlist.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function createSourceFromDomain() {
    const domain = (ctx.domain ?? "").trim();
    if (!domain) {
      setMsg("No domain available to create source.");
      return;
    }
    setBusy("source");
    setMsg(null);
    try {
      const res = await fetch(`/api/sources`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Manual: ${domain}`.slice(0, 100),
          type: "SHOPIFY_DOMAIN",
          domain,
          config: { sourceDomain: domain },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json.error ?? "Source create failed");
      setMsg("Source created.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function openInReviewQueue() {
    if (!entityType || !entityId) {
      setMsg("No entity to review.");
      return;
    }
    setBusy("review");
    setMsg(null);
    try {
      const res = await fetch("/api/review-queue/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type:
            entityType === "DISCOVERY_CANDIDATE"
              ? "DISCOVERY_CANDIDATE_REVIEW"
              : entityType === "CREATIVE_CLUSTER"
                ? "LOW_CONFIDENCE_CREATIVE_CLUSTER"
                : "HIGH_SCORE_UNVERIFIED_ITEM",
          title: ctx.label ? `Review: ${ctx.label}` : `Review ${entityType}`,
          reason: "Manual analyst action",
          priority: 70,
          entityType,
          entityId,
          sourceId: ctx.sourceId ?? null,
          metadata: { from: "action_menu" },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json.error ?? "Failed to open review item");
      setMsg("Added to review queue.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function promoteCandidate() {
    const id = ctx.candidateId ?? (entityType === "DISCOVERY_CANDIDATE" ? entityId : "");
    if (!id) return;
    setBusy("promote");
    setMsg(null);
    try {
      const res = await fetch(`/api/sources/discovery-candidates/${id}/promote`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json.error ?? "Promote failed");
      setMsg("Promoted.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const compareHref = ctx.domain ? `/compare?domains=${encodeURIComponent(ctx.domain)}` : null;
  const adsHref = entityType === "CREATIVE_CLUSTER" && entityId ? `/ads?creativeClusterId=${encodeURIComponent(entityId)}` : null;

  const canPromote = entityType === "DISCOVERY_CANDIDATE" && (ctx.candidateId || entityId);
  const canWatchlist = Boolean(ctx.domain);
  const canCompare = Boolean(compareHref);

  return (
    <div ref={rootRef} className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setMsg(null);
          if (!open) ensureWatchlists();
        }}
        className={
          compact
            ? "px-2 py-1 text-xs rounded border border-border hover:bg-surface-2"
            : "px-3 py-1.5 text-xs rounded border border-border hover:bg-surface-2"
        }
      >
        ⋯
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 z-20 min-w-[260px] rounded-lg border border-border bg-card shadow-sm overflow-hidden ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="px-3 py-2 text-[11px] text-muted uppercase tracking-wide border-b border-border">
            Actions
          </div>

          {canWatchlist && (
            <div className="px-3 py-2 border-b border-border">
              <div className="text-[11px] text-muted mb-1">Add to watchlist</div>
              <div className="flex items-center gap-2">
                <select
                  value={watchlistId}
                  onChange={(e) => setWatchlistId(e.target.value)}
                  className="flex-1 bg-surface border border-border rounded px-2 py-1 text-xs text-foreground"
                >
                  {(watchlists ?? []).length === 0 ? <option value="">No watchlists</option> : null}
                  {(watchlists ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={addToWatchlist}
                  className="px-2.5 py-1 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 border border-border"
                >
                  {busy === "watchlist" ? "Adding…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {canCompare && (
            <Link href={compareHref!} className={menuItemClass()}>
              Open compare →
            </Link>
          )}

          {adsHref && (
            <Link href={adsHref} className={menuItemClass()}>
              Open related ads →
            </Link>
          )}

          {ctx.domain ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={createSourceFromDomain}
              className={menuItemClass(busy !== null)}
            >
              {busy === "source" ? "Creating source…" : "Create source from domain"}
            </button>
          ) : null}

          <button
            type="button"
            disabled={busy !== null}
            onClick={openInReviewQueue}
            className={menuItemClass(busy !== null)}
          >
            {busy === "review" ? "Opening…" : "Open in Review Queue"}
          </button>

          {canPromote ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={promoteCandidate}
              className={menuItemClass(busy !== null)}
            >
              {busy === "promote" ? "Promoting…" : "Promote candidate"}
            </button>
          ) : null}

          {deepLink ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("copy");
                const ok = await copyText(deepLink);
                setBusy(null);
                setMsg(ok ? "Copied link." : "Copy failed.");
              }}
              className={menuItemClass(busy !== null)}
            >
              {busy === "copy" ? "Copying…" : "Copy shareable link"}
            </button>
          ) : null}

          {msg ? <div className="px-3 py-2 text-xs text-muted border-t border-border">{msg}</div> : null}
        </div>
      )}
    </div>
  );
}

