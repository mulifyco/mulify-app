"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import ActionMenu from "@/components/internal/ActionMenu";
import CopilotDrawer from "@/components/internal/CopilotDrawer";
import AutoActionsBar from "@/components/internal/AutoActionsBar";

type ReviewQueueStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";

export type ReviewQueueRow = {
  id: string;
  type: string;
  status: ReviewQueueStatus;
  priority: number;
  title: string;
  reason: string;
  entityType: string | null;
  entityId: string | null;
  sourceId: string | null;
  metadata: any;
  createdAt: string;
};

function statusVariant(s: ReviewQueueStatus): "green" | "yellow" | "red" | "default" {
  if (s === "OPEN") return "red";
  if (s === "IN_REVIEW") return "yellow";
  if (s === "RESOLVED") return "green";
  return "default";
}

function priorityVariant(p: number): "green" | "yellow" | "red" | "default" {
  if (p >= 85) return "red";
  if (p >= 60) return "yellow";
  return "default";
}

function entityHref(row: ReviewQueueRow): string | null {
  const t = row.entityType ?? "";
  const id = row.entityId ?? "";
  if (!t || !id) return null;
  if (t === "PRODUCT") return `/products/${id}`;
  if (t === "AD") return `/ads/${id}`;
  if (t === "STORE") return `/stores/${id}`;
  if (t === "SOURCE") return `/sources/${id}`;
  if (t === "DISCOVERY_CANDIDATE") return `/sources/discovery-candidates`;
  if (t === "DOMAIN") return `/sources/discovery-candidates?search=${encodeURIComponent(id)}`;
  return null;
}

export default function ReviewQueueClient({ initial }: { initial: ReviewQueueRow[] }) {
  const [rows, setRows] = useState<ReviewQueueRow[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const ids = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  async function patch(id: string, body: any) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/review-queue/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      const updated = json.data as any;
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: updated.status,
                priority: updated.priority,
              }
            : r
        )
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusyId(null);
    }
  }

  async function resolve(id: string) {
    const note = (noteById[id] ?? "").trim();
    await patch(id, { status: "RESOLVED", resolutionNote: note || null });
  }

  async function dismiss(id: string) {
    const note = (noteById[id] ?? "").trim();
    await patch(id, { status: "DISMISSED", resolutionNote: note || null });
  }

  if (!rows.length) return null;

  return (
    <div className="space-y-3">
      {err && <div className="text-sm text-red-600">{err}</div>}
      <div className="rounded-lg border border-border bg-card overflow-x-auto shadow-sm">
        <table className="w-full text-sm min-w-[1200px]">
          <thead>
            <tr className="bg-surface-2 border-b border-border text-left">
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Title
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Type
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Status
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Priority
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Reason
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Created
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide">
                Entity
              </th>
              <th className="px-3 py-2.5 text-[11px] font-semibold text-muted uppercase tracking-wide text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => {
              const href = entityHref(r);
              const busy = busyId === r.id;
              return (
                <tr key={r.id} className="hover:bg-surface-2/70 align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{r.title}</div>
                    <div className="text-[11px] text-muted-2 font-mono mt-0.5">{r.id.slice(0, 10)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{r.type}</td>
                  <td className="px-3 py-2.5">
                    <Badge label={r.status} variant={statusVariant(r.status)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge label={String(r.priority)} variant={priorityVariant(r.priority)} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted max-w-[520px] truncate" title={r.reason}>
                    {r.reason}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {href ? (
                      <Link href={href} className="text-indigo-600 hover:opacity-80">
                        Open →
                      </Link>
                    ) : r.sourceId ? (
                      <Link href={`/sources/${r.sourceId}`} className="text-indigo-600 hover:opacity-80">
                        Source →
                      </Link>
                    ) : (
                      <span className="text-muted-2">—</span>
                    )}
                    {r.entityType && r.entityId && (
                      <div className="text-[11px] text-muted-2 font-mono mt-0.5">
                        {r.entityType}:{r.entityId.slice(0, 10)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <ActionMenu
                        ctx={{
                          entityType: (r.entityType as any) ?? undefined,
                          entityId: r.entityId ?? undefined,
                          domain: (r.metadata as any)?.domain ?? undefined,
                          sourceId: r.sourceId ?? undefined,
                          label: r.title,
                        }}
                      />
                      <button
                        type="button"
                        disabled={busy || r.status === "IN_REVIEW"}
                        onClick={() => patch(r.id, { status: "IN_REVIEW" })}
                        className="px-2.5 py-1.5 text-xs rounded border border-border hover:bg-surface-2 disabled:opacity-50"
                      >
                        In review
                      </button>
                      <button
                        type="button"
                        disabled={busy || r.status === "RESOLVED"}
                        onClick={() => resolve(r.id)}
                        className="px-2.5 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 border border-border"
                      >
                        Resolve
                      </button>
                      <button
                        type="button"
                        disabled={busy || r.status === "DISMISSED"}
                        onClick={() => dismiss(r.id)}
                        className="px-2.5 py-1.5 text-xs rounded border border-border text-muted hover:bg-surface-2 disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                    {r.entityType && r.entityId ? (
                      <div className="mt-2 flex justify-end">
                        <AutoActionsBar
                          compact
                          entityType={String(r.entityType)}
                          entityId={String(r.entityId)}
                          actions={[
                            { label: "Compare", actionType: "OPEN_COMPARE" },
                            { label: "Report", actionType: "CREATE_REPORT" },
                            { label: "Watch closely", actionType: "ADD_TO_WATCHLIST", context: { domain: (r.metadata as any)?.domain } },
                          ]}
                        />
                      </div>
                    ) : null}
                    <div className="mt-2">
                      <input
                        value={noteById[r.id] ?? ""}
                        onChange={(e) => {
                          if (!ids.has(r.id)) return;
                          setNoteById((p) => ({ ...p, [r.id]: e.target.value }));
                        }}
                        placeholder="Resolution note…"
                        className="w-full px-2 py-1.5 text-xs rounded border border-border bg-background"
                      />
                    </div>
                    {(r.entityType && r.entityId) || r.type === "DISCOVERY_CANDIDATE_REVIEW" ? (
                      <div className="mt-2">
                        <ExplainDrawer
                          entityType={
                            r.type === "LOW_CONFIDENCE_PRODUCT_CLUSTER" || r.type === "HIGH_SCORE_UNVERIFIED_ITEM"
                              ? "PRODUCT_CLUSTER"
                              : r.type === "LOW_CONFIDENCE_CREATIVE_CLUSTER"
                                ? "CREATIVE_CLUSTER"
                                : r.type === "DISCOVERY_CANDIDATE_REVIEW"
                                  ? "DISCOVERY_CANDIDATE"
                                  : String(r.entityType ?? "")
                          }
                          entityId={String(r.entityId ?? "")}
                          triggerLabel="Explain"
                          title={`Review item · ${r.title}`}
                        />
                        {r.type === "LOW_CONFIDENCE_PRODUCT_CLUSTER" || r.type === "HIGH_SCORE_UNVERIFIED_ITEM" ? (
                          <div className="mt-1">
                            <CopilotDrawer
                              entityType="PRODUCT_CLUSTER"
                              entityId={String(r.entityId ?? "")}
                              triggerLabel="Copilot"
                              title={`Copilot · ${r.title}`}
                            />
                          </div>
                        ) : r.type === "LOW_CONFIDENCE_CREATIVE_CLUSTER" ? (
                          <div className="mt-1">
                            <CopilotDrawer
                              entityType="CREATIVE_CLUSTER"
                              entityId={String(r.entityId ?? "")}
                              triggerLabel="Copilot"
                              title={`Copilot · ${r.title}`}
                            />
                          </div>
                        ) : r.entityType === "STORE" && r.entityId ? (
                          <div className="mt-1">
                            <CopilotDrawer
                              entityType="STORE"
                              entityId={String(r.entityId)}
                              triggerLabel="Copilot"
                              title={`Copilot · ${r.title}`}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {r.metadata != null && (
                      <details className="mt-2 text-left">
                        <summary className="text-xs text-muted cursor-pointer hover:opacity-80">
                          View metadata
                        </summary>
                        <div className="mt-2">
                          <JsonPayloadViewer data={r.metadata} />
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

