import { notFound } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import TimelineHistoryPanel from "@/components/internal/TimelineHistoryPanel";
import ExplainDrawer from "@/components/internal/ExplainDrawer";
import CopilotDrawer from "@/components/internal/CopilotDrawer";
import PersonaAnalyzerDrawer from "@/components/internal/PersonaAnalyzerDrawer";
import HookIntelligenceDrawer from "@/components/internal/HookIntelligenceDrawer";
import type { Platform } from "@/types";
import { creativeClusterDb } from "@/lib/prisma-creative-cluster-delegate";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

type CreativeClusterDetail = {
  id: string;
  fingerprint: string;
  platform: Platform;
  creativeCount: number;
  storeCount: number;
  productClusterCount: number;
  scaleScore: number;
  saturationScore: number;
  creativeWinnerScore: number;
  confidence: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export default async function CreativeClusterDetailPage({ params }: Props) {
  const { id } = await params;
  const cluster = (await creativeClusterDb().findUnique({
    where: { id },
    select: {
      id: true,
      fingerprint: true,
      platform: true,
      creativeCount: true,
      storeCount: true,
      productClusterCount: true,
      scaleScore: true,
      saturationScore: true,
      creativeWinnerScore: true,
      confidence: true,
      firstSeenAt: true,
      lastSeenAt: true,
    },
  })) as CreativeClusterDetail | null;

  if (!cluster) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={cluster.fingerprint.slice(0, 48) + (cluster.fingerprint.length > 48 ? "…" : "")}
        description={`Creative cluster · ${cluster.platform}`}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <ExplainDrawer
              entityType="CREATIVE_CLUSTER"
              entityId={cluster.id}
              triggerLabel="Why?"
              title="Creative cluster"
            />
            <CopilotDrawer entityType="CREATIVE_CLUSTER" entityId={cluster.id} triggerLabel="Copilot" title="Creative cluster copilot" />
            <PersonaAnalyzerDrawer
              entityType="CREATIVE_CLUSTER"
              entityId={cluster.id}
              triggerLabel="Audience"
              title="Audience · creative cluster"
            />
            <HookIntelligenceDrawer
              entityType="CREATIVE_CLUSTER"
              entityId={cluster.id}
              triggerLabel="Hooks"
              title="Winning hooks · creative cluster"
            />
            <Link href="/boards/creative-winners" className="text-sm text-muted hover:opacity-80">
              ← Creative Winners
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge label={`Winner ${cluster.creativeWinnerScore.toFixed(1)}`} variant="purple" />
        <Badge label={`Scale ${cluster.scaleScore}`} variant="blue" />
        <Badge label={`Creatives ${cluster.creativeCount}`} variant="default" />
        <Badge label={`Stores ${cluster.storeCount}`} variant="default" />
      </div>

      <TimelineHistoryPanel
        apiUrl={`/api/timeline/creatives/${cluster.id}`}
        title="Scale & reuse timeline (30d)"
        valueKeys={["creativeWinnerScore", "scaleScore", "creativeCount", "storeCount"]}
      />
    </div>
  );
}
