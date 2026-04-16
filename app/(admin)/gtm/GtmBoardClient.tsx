"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getOutreachTemplate, OUTREACH_TEMPLATE_OPTIONS, type OutreachTemplateId } from "@/lib/gtm/outreach-templates";

/** Mirrors `getGtmDashboardStats` shape for client props (avoid importing server service in "use client"). */
export type GtmDashboardStatsProps = {
  outreachSent7d: number;
  demosBooked: number;
  demosDone: number;
  trialsActive: number;
  wonCount: number;
  pipelineMRR: number;
  hotProspects: GtmLead[];
  trialWatch: GtmLead[];
};

const STAGES = [
  "PROSPECT",
  "CONTACTED",
  "DEMO_BOOKED",
  "DEMO_DONE",
  "TRIAL",
  "WON",
  "LOST",
  "FOLLOW_UP_LATER",
] as const;

export type GtmStage = (typeof STAGES)[number];

export type GtmLead = {
  id: string;
  company: string;
  name: string | null;
  email: string | null;
  website: string | null;
  source: string;
  estimatedMRR: number;
  priorityScore: number;
  nextFollowUpAt: Date | string | null;
  stage: GtmStage;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function asDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isOverdue(next: Date | string | null, stage: GtmStage): boolean {
  if (!next || stage === "WON" || stage === "LOST") return false;
  const d = asDate(next);
  return d ? d.getTime() < startOfToday().getTime() : false;
}

function isDueToday(next: Date | string | null, stage: GtmStage): boolean {
  if (!next || stage === "WON" || stage === "LOST") return false;
  const d = asDate(next);
  if (!d) return false;
  const s = startOfToday();
  const e = new Date(s);
  e.setDate(e.getDate() + 1);
  return d >= s && d < e;
}

export default function GtmBoardClient({
  initialByStage,
  initialStats,
}: {
  initialByStage: Record<GtmStage, GtmLead[]>;
  initialStats: GtmDashboardStatsProps;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const allLeads = useMemo(() => STAGES.flatMap((s) => initialByStage[s] ?? []), [initialByStage]);

  const todayFollowUps = useMemo(
    () => allLeads.filter((l) => isDueToday(l.nextFollowUpAt, l.stage)),
    [allLeads],
  );

  async function patchLead(id: string, patch: Record<string, unknown>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/gtm/leads/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Update failed");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function logOutreach(leadId: string) {
    setBusyId(leadId);
    try {
      const res = await fetch(`/api/gtm/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "OUTREACH_SENT", note: "Logged from GTM board" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Log failed");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function copyTemplate(tpl: OutreachTemplateId, lead: GtmLead) {
    const { subject, body } = getOutreachTemplate(tpl, {
      company: lead.company,
      firstName: lead.name ?? undefined,
    });
    const text = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy:", text);
    }
  }

  function LeadCard({ lead }: { lead: GtmLead }) {
    const overdue = isOverdue(lead.nextFollowUpAt, lead.stage);
    return (
      <div
        className={`rounded-lg border bg-card p-3 text-xs shadow-sm ${
          overdue ? "border-amber-500/60 ring-1 ring-amber-500/25" : "border-border"
        }`}
      >
        <div className="font-semibold text-foreground text-sm">{lead.company}</div>
        {lead.name ? <div className="text-muted mt-0.5">{lead.name}</div> : null}
        <div className="mt-2 space-y-1 text-[11px] text-muted">
          {lead.email ? <div>{lead.email}</div> : null}
          {lead.website ? <div className="truncate">{lead.website}</div> : null}
          <div>src: {lead.source}</div>
          <div className="tabular-nums">MRR est: ${lead.estimatedMRR} · pri {lead.priorityScore}</div>
          {lead.nextFollowUpAt ? (
            <div className={overdue ? "text-amber-700 dark:text-amber-300 font-medium" : ""}>
              Next: {new Date(lead.nextFollowUpAt).toLocaleString()}
              {overdue ? " · overdue" : ""}
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <select
            className="max-w-full bg-surface border border-border rounded px-1 py-1 text-[11px]"
            value={lead.stage}
            disabled={busyId === lead.id}
            onChange={(e) => void patchLead(lead.id, { stage: e.target.value })}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <button
            type="button"
            disabled={busyId === lead.id}
            onClick={() => void logOutreach(lead.id)}
            className="px-2 py-1 rounded border border-border hover:bg-surface-2 text-[11px]"
          >
            Log outreach
          </button>
          <select
            className="max-w-[9rem] bg-surface border border-border rounded px-1 py-1 text-[11px]"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value as OutreachTemplateId | "";
              e.target.value = "";
              if (v) void copyTemplate(v, lead);
            }}
          >
            <option value="" disabled>
              Copy template…
            </option>
            {OUTREACH_TEMPLATE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          ["Outreach 7d", String(initialStats.outreachSent7d)],
          ["Demos booked", String(initialStats.demosBooked)],
          ["Demos done", String(initialStats.demosDone)],
          ["Trials (GTM)", String(initialStats.trialsActive)],
          ["Won", String(initialStats.wonCount)],
          ["Pipeline MRR", `$${initialStats.pipelineMRR.toLocaleString()}`],
        ].map(([a, b]) => (
          <div key={a} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="text-[10px] font-semibold text-muted uppercase tracking-wide">{a}</div>
            <div className="text-lg font-bold tabular-nums mt-1 text-foreground">{b}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Today follow-ups</div>
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {todayFollowUps.length === 0 ? (
              <div className="text-xs text-muted">None scheduled for today.</div>
            ) : (
              todayFollowUps.map((l) => <LeadCard key={l.id} lead={l} />)
            )}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Hot prospects</div>
          <p className="text-xs text-muted mt-1">Priority score ≥ 75, excluding won/lost.</p>
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {initialStats.hotProspects.map((l) => (
              <LeadCard key={l.id} lead={l} />
            ))}
            {initialStats.hotProspects.length === 0 ? <div className="text-xs text-muted">No hot rows.</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="text-sm font-semibold text-foreground">Trial conversion watch</div>
        <p className="text-xs text-muted mt-1">GTM leads in TRIAL — nudge before they go cold.</p>
        <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {initialStats.trialWatch.map((l) => (
            <LeadCard key={l.id} lead={l} />
          ))}
        </div>
        {initialStats.trialWatch.length === 0 ? <div className="text-xs text-muted mt-2">No trials in GTM.</div> : null}
      </div>

      <div>
        <div className="text-sm font-semibold text-foreground mb-3">Outbound pipeline</div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STAGES.map((stage) => (
            <div key={stage} className="min-w-[220px] max-w-[260px] shrink-0 rounded-xl border border-border bg-surface-2/40 p-2">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wide px-1 py-1">
                {stage.replace(/_/g, " ")} ({initialByStage[stage]?.length ?? 0})
              </div>
              <div className="mt-2 space-y-2 max-h-[480px] overflow-y-auto">
                {(initialByStage[stage] ?? []).map((l) => (
                  <LeadCard key={l.id} lead={l} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
