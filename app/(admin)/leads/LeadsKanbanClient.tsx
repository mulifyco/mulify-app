"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/internal/EmptyState";
import LoadDemoWorkspaceButton from "@/components/launch/LoadDemoWorkspaceButton";

type LeadStage =
  | "NEW"
  | "RESEARCHING"
  | "CONTACTED"
  | "FOLLOW_UP"
  | "WON"
  | "LOST"
  | "PARTNER"
  | "ACQUISITION_TARGET";

type LeadRow = {
  id: string;
  domain: string;
  companyName: string | null;
  storeId: string | null;
  estimatedPotentialScore: number;
  leadStage: LeadStage;
  tags: string[];
  notes: string | null;
  updatedAt: string | Date;
};

type Suggestion = {
  domain: string;
  storeId: string | null;
  companyName: string | null;
  estimatedPotentialScore: number;
  reason: string;
  tags: string[];
};

const STAGES: Array<{ key: LeadStage; label: string }> = [
  { key: "NEW", label: "New" },
  { key: "RESEARCHING", label: "Researching" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "FOLLOW_UP", label: "Follow-up" },
  { key: "PARTNER", label: "Partner" },
  { key: "ACQUISITION_TARGET", label: "Acquisition" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
];

function scoreTone(n: number): string {
  if (n >= 80) return "text-purple-600";
  if (n >= 65) return "text-green-600";
  if (n >= 50) return "text-yellow-600";
  return "text-muted";
}

export default function LeadsKanbanClient({
  initialLeads,
  initialSuggestions,
}: {
  initialLeads: LeadRow[];
  initialSuggestions: Suggestion[];
}) {
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => (l.domain + " " + (l.companyName ?? "") + " " + (l.notes ?? "")).toLowerCase().includes(q));
  }, [leads, search]);

  const byStage = useMemo(() => {
    const m = new Map<LeadStage, LeadRow[]>();
    for (const s of STAGES) m.set(s.key, []);
    for (const l of filtered) (m.get(l.leadStage) ?? m.set(l.leadStage, []).get(l.leadStage))!.push(l);
    for (const s of STAGES) (m.get(s.key) ?? []).sort((a, b) => b.estimatedPotentialScore - a.estimatedPotentialScore);
    return m;
  }, [filtered]);

  async function patchStage(id: string, leadStage: LeadStage) {
    setBusy(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadStage }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, leadStage } : l)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function createFromSuggestion(s: Suggestion) {
    setBusy(s.domain);
    setMsg(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: s.domain,
          storeId: s.storeId,
          companyName: s.companyName,
          estimatedPotentialScore: s.estimatedPotentialScore,
          tags: s.tags,
          notes: s.reason,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      setLeads((prev) => [json.data as LeadRow, ...prev]);
      setSuggestions((prev) => prev.filter((x) => x.domain !== s.domain));
      setMsg("Lead created.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const emptyPipeline = leads.length === 0 && suggestions.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
            <span className="text-[11px] text-muted">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="domain, company, notes…"
              className="w-full min-w-0 bg-surface border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-2 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
            />
          </label>
          {msg ? <div className="text-xs text-muted sm:pb-1">{msg}</div> : null}
        </div>
        <Link href="/leads?refresh=1" className="shrink-0 text-xs text-muted hover:opacity-80">
          Refresh suggestions →
        </Link>
      </div>

      {emptyPipeline ? (
        <EmptyState
          title="No leads in the pipeline"
          description="Promote domains from Compare, watchlists, or board deep-dives — then move stages as you research and contact."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <LoadDemoWorkspaceButton label="Load sample leads" />
              <Link
                href="/compare?domains=sample-brand-a.demo,sample-brand-b.demo"
                className="rounded-lg border border-border bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
              >
                Try sample compare
              </Link>
              <Link
                href="/boards/ready-to-scale"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
              >
                Ready to Scale
              </Link>
            </div>
          }
        />
      ) : null}

      {suggestions.length ? (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-[0.18em] mb-2">Lead suggestions</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestions.slice(0, 12).map((s) => (
              <div key={s.domain} className="rounded border border-border bg-background px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">{s.domain}</div>
                    <div className="text-[11px] text-muted truncate">{s.companyName ?? "—"}</div>
                    <div className="text-[11px] text-muted mt-1 truncate" title={s.reason}>
                      {s.reason}
                    </div>
                  </div>
                  <div className={`text-sm font-semibold tabular-nums ${scoreTone(s.estimatedPotentialScore)}`}>
                    {s.estimatedPotentialScore}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(s.tags ?? []).slice(0, 3).map((t) => (
                      <span key={t} className="text-[11px] px-2 py-0.5 rounded border border-border bg-surface-2 text-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() => createFromSuggestion(s)}
                    className="px-2.5 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 border border-border"
                  >
                    {busy === s.domain ? "Adding…" : "Add lead"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {emptyPipeline ? null : (
      <div className="md:overflow-x-auto md:pb-1">
        <div className="flex flex-col gap-8 md:flex-row md:gap-4 md:min-w-[1100px]">
          {STAGES.map((s) => {
            const rows = byStage.get(s.key) ?? [];
            return (
              <div key={s.key} className="w-full md:w-[300px] md:shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wide">
                    {s.label} <span className="text-muted-2 tabular-nums">({rows.length})</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {rows.length === 0 ? (
                    <div className="text-xs text-muted-2 px-2 py-6 text-center border border-dashed border-border rounded">
                      —
                    </div>
                  ) : (
                    rows.slice(0, 120).map((l) => (
                      <div key={l.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/leads/${l.id}`} className="text-sm font-semibold text-foreground hover:opacity-80 truncate block">
                              {l.domain}
                            </Link>
                            <div className="text-[11px] text-muted truncate">{l.companyName ?? "—"}</div>
                          </div>
                          <div className={`text-sm font-semibold tabular-nums ${scoreTone(l.estimatedPotentialScore)}`}>{l.estimatedPotentialScore}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(l.tags ?? []).slice(0, 4).map((t) => (
                            <span key={t} className="text-[11px] px-2 py-0.5 rounded border border-border bg-surface-2 text-foreground">
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <select
                            value={l.leadStage}
                            disabled={busy != null}
                            onChange={(e) => patchStage(l.id, e.target.value as LeadStage)}
                            className="bg-surface border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                          >
                            {STAGES.map((x) => (
                              <option key={x.key} value={x.key}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            {l.storeId ? (
                              <Link href={`/compare?domains=${encodeURIComponent(l.domain)}`} className="text-xs text-indigo-600 hover:opacity-80">
                                Compare
                              </Link>
                            ) : (
                              <Link href={`/compare?domains=${encodeURIComponent(l.domain)}`} className="text-xs text-indigo-600 hover:opacity-80">
                                Compare
                              </Link>
                            )}
                            {busy === l.id ? <span className="text-[11px] text-muted">…</span> : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

