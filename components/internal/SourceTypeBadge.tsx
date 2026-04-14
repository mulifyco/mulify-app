import Badge from "@/components/ui/Badge";
import type { SourceType } from "@/types";

const label: Record<SourceType, string> = {
  META_ADS: "Meta Ads",
  SHOPIFY_STOREFRONT: "Shopify",
  SHOPIFY_DOMAIN: "Shopify Domain",
  MANUAL: "Manual",
  KEYWORD: "Keyword",
  META_PAGE: "Meta Page",
  TIKTOK_PAGE: "TikTok Page",
  CATEGORY: "Category",
};

const variantMap: Record<SourceType, "blue" | "purple" | "default"> = {
  META_ADS: "blue",
  SHOPIFY_STOREFRONT: "purple",
  SHOPIFY_DOMAIN: "purple",
  MANUAL: "default",
  KEYWORD: "default",
  META_PAGE: "default",
  TIKTOK_PAGE: "default",
  CATEGORY: "default",
};

export default function SourceTypeBadge({ type }: { type: SourceType | string }) {
  const t = type as SourceType;
  const v = variantMap[t] ?? "default";
  return <Badge label={label[t] ?? type} variant={v} />;
}
