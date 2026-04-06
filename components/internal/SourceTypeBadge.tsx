import Badge from "@/components/ui/Badge";
import type { SourceType } from "@/types";

const label: Record<SourceType, string> = {
  META_ADS: "Meta Ads",
  SHOPIFY_STOREFRONT: "Shopify",
  MANUAL: "Manual",
};

const variantMap: Record<SourceType, "blue" | "purple" | "default"> = {
  META_ADS: "blue",
  SHOPIFY_STOREFRONT: "purple",
  MANUAL: "default",
};

export default function SourceTypeBadge({ type }: { type: SourceType | string }) {
  const t = type as SourceType;
  const v = variantMap[t] ?? "default";
  return <Badge label={label[t] ?? type} variant={v} />;
}
