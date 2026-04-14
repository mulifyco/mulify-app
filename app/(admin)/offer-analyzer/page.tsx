import OfferAnalyzerDrawer from "@/components/internal/OfferAnalyzerDrawer";

export const dynamic = "force-dynamic";

export default async function OfferAnalyzerPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
}) {
  const sp = await searchParams;
  const entityType = String(sp.entityType ?? "").trim();
  const entityId = String(sp.entityId ?? "").trim();

  if (!entityType || !entityId) {
    return <div className="text-sm text-muted">Missing entityType/entityId.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted uppercase tracking-wide">Offer analyzer</div>
      <div className="text-sm text-foreground">Open the drawer to view the analysis.</div>
      <OfferAnalyzerDrawer entityType={entityType} entityId={entityId} triggerLabel="Open analyzer" title={`${entityType}:${entityId}`} />
    </div>
  );
}

