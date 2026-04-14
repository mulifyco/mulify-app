import type { SourceReliabilityStatus } from "@prisma/client";
import Badge from "@/components/ui/Badge";

const LABEL: Record<SourceReliabilityStatus, string> = {
  HEALTHY: "Healthy",
  DEGRADED: "Degraded",
  COOLING_DOWN: "Cooling",
  DISABLED: "Disabled",
};

const VARIANT: Record<SourceReliabilityStatus, "green" | "yellow" | "red" | "default"> = {
  HEALTHY: "green",
  DEGRADED: "yellow",
  COOLING_DOWN: "yellow",
  DISABLED: "red",
};

export default function SourceReliabilityBadge({ status }: { status: SourceReliabilityStatus }) {
  return <Badge label={LABEL[status] ?? status} variant={VARIANT[status] ?? "default"} />;
}
