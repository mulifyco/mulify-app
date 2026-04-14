import prisma from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import LeadsKanbanClient from "./LeadsKanbanClient";
import QueryErrorState from "@/components/internal/QueryErrorState";
import { suggestLeads } from "@/server/services/lead-intelligence.service";

export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ refresh?: string }> }) {
  const sp = await searchParams;
  const refresh = sp.refresh === "1";

  let error: string | null = null;
  let leads: any[] = [];
  let suggestions: any[] = [];
  try {
    [leads, suggestions] = await Promise.all([
      prisma.lead
        .findMany({
          orderBy: [{ leadStage: "asc" }, { estimatedPotentialScore: "desc" }, { updatedAt: "desc" }],
          take: 300,
          select: {
            id: true,
            domain: true,
            companyName: true,
            storeId: true,
            estimatedPotentialScore: true,
            leadStage: true,
            tags: true,
            notes: true,
            updatedAt: true,
          },
        })
        .catch(() => []),
      refresh ? suggestLeads({ take: 20 }).catch(() => []) : Promise.resolve([]),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load leads.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Outreach CRM · pipeline by stage · quick notes + shortcuts"
        action={<div className="text-xs text-muted">Tip: use “Refresh” to pull new lead suggestions.</div>}
      />

      {error ? <QueryErrorState message={error} /> : <LeadsKanbanClient initialLeads={leads as any} initialSuggestions={suggestions as any} />}
    </div>
  );
}

