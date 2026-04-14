import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import JsonPayloadViewer from "@/components/internal/JsonPayloadViewer";
import QueryErrorState from "@/components/internal/QueryErrorState";
import PromoteToGtmLeadButton from "@/components/gtm/PromoteToGtmLeadButton";
import { auth } from "@/lib/auth";
import { canAccessFeature, getUserPlan } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const plan = getUserPlan(session);
  const showGtm = canAccessFeature(plan, "OPS");

  let lead: any | null = null;
  let error: string | null = null;
  try {
    lead = await prisma.lead.findUnique({
      where: { id },
      include: { activities: { orderBy: { createdAt: "desc" }, take: 50 } },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load lead.";
  }
  if (!lead && !error) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead?.domain ?? "Lead"}
        description={lead?.companyName ?? "Outreach record"}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            {lead?.domain ? (
              <Link
                href={`/compare?domains=${encodeURIComponent(String(lead.domain))}`}
                className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm"
              >
                Compare
              </Link>
            ) : null}
            {lead?.storeId ? (
              <Link
                href={`/stores/${lead.storeId}`}
                className="px-3 py-1.5 text-xs bg-card hover:bg-surface-2 rounded text-foreground border border-border shadow-sm"
              >
                Store
              </Link>
            ) : null}
            <Link href="/leads" className="text-sm text-muted hover:opacity-80">
              ← Leads
            </Link>
            {showGtm ? <PromoteToGtmLeadButton crmLeadId={id} /> : null}
          </div>
        }
      />

      {error ? (
        <QueryErrorState message={error} />
      ) : !lead ? null : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Lead profile</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  ["Stage", String(lead.leadStage)],
                  ["Potential", String(lead.estimatedPotentialScore)],
                  ["Owner", lead.owner ?? "—"],
                  ["Email", lead.contactEmail ?? "—"],
                  ["Contact form", lead.contactFormUrl ?? "—"],
                  ["Instagram", lead.instagramUrl ?? "—"],
                  ["TikTok", lead.tiktokUrl ?? "—"],
                ].map(([k, v]) => (
                  <div key={String(k)} className="contents">
                    <dt className="text-xs text-muted-2">{k}</dt>
                    <dd className="text-foreground truncate">{String(v)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4">
                <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Notes</div>
                <div className="text-sm text-foreground whitespace-pre-wrap">{lead.notes ?? "—"}</div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Tags</div>
              <div className="flex flex-wrap gap-2">
                {(lead.tags ?? []).length ? (
                  (lead.tags as string[]).map((t) => (
                    <span key={t} className="text-xs px-2 py-1 rounded bg-surface-2 text-foreground border border-border">
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-2">—</span>
                )}
              </div>
              <div className="mt-4 text-xs text-muted">
                Created {String(lead.createdAt?.toISOString?.() ?? lead.createdAt ?? "—")}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Activities</div>
            {lead.activities?.length ? (
              <ul className="space-y-2">
                {(lead.activities as any[]).map((a) => (
                  <li key={a.id} className="rounded border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted">{a.type ?? "NOTE"}</div>
                      <div className="text-[11px] text-muted">{String(a.createdAt?.toISOString?.() ?? a.createdAt ?? "—")}</div>
                    </div>
                    <div className="text-sm text-foreground mt-1 whitespace-pre-wrap">{a.note}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted">—</div>
            )}
            <div className="mt-3 text-xs text-muted">
              Add activity via API: <span className="font-mono">POST /api/leads/{id}/activity</span>
            </div>
          </div>

          <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <summary className="text-xs text-muted cursor-pointer hover:opacity-80">Raw lead payload</summary>
            <div className="mt-3">
              <JsonPayloadViewer data={lead} maxCollapsedHeight={480} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

