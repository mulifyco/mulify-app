import type { Platform } from "@/types";

type ConfidenceRow = { level: string; overallScore: number } | null | undefined;

export function adRowWarnings(ad: {
  isActive: boolean | null;
  destinationUrl: string | null;
  canonicalUrl: string | null;
  confidenceScores: ConfidenceRow[] | { level: string; overallScore: number }[];
  lastSeenAt: Date;
  landingPages?: { domain: string }[];
}): string[] {
  const w: string[] = [];
  const hasUrl = Boolean(ad.destinationUrl || ad.canonicalUrl);
  if (!hasUrl) w.push("No landing URL");
  const score = ad.confidenceScores[0];
  if (score && (score.level === "LOW" || score.overallScore < 0.45)) w.push("Low confidence");
  if (ad.isActive === false) {
    const days = (Date.now() - ad.lastSeenAt.getTime()) / 86400000;
    if (days > 60) w.push("Inactive · stale");
    else w.push("Inactive");
  }
  if (ad.landingPages && ad.landingPages.length > 1) w.push("Multi LP");
  return w;
}

export function storeRowWarnings(store: {
  _count: { products: number; collections: number };
  confidenceScores: ConfidenceRow[] | { level: string; overallScore: number }[];
  lastSeenAt: Date;
  lastCrawledAt: Date | null;
  landingPageLinkCount?: number;
}): string[] {
  const w: string[] = [];
  if (store._count.products === 0) w.push("No products");
  const score = store.confidenceScores[0];
  if (score && (score.level === "LOW" || score.overallScore < 0.45)) w.push("Low confidence");
  const staleDays = (Date.now() - store.lastSeenAt.getTime()) / 86400000;
  if (staleDays > 30) w.push("Stale");
  if (store.lastCrawledAt) {
    const crawlStale = (Date.now() - store.lastCrawledAt.getTime()) / 86400000;
    if (crawlStale > 14) w.push("Crawl old");
  }
  if ((store.landingPageLinkCount ?? 0) === 0 && store._count.products > 0) w.push("No LP links");
  return w;
}

export function productRowWarnings(p: {
  priceMin: number | null;
  priceMax: number | null;
  featuredImage: string | null;
  isAvailable: boolean | null;
  confidenceScores: ConfidenceRow[] | { level: string; overallScore: number }[];
  _count: { collectionMemberships: number };
  duplicateHandle?: boolean;
}): string[] {
  const w: string[] = [];
  if (p.priceMin == null && p.priceMax == null) w.push("No price");
  if (!p.featuredImage) w.push("No image");
  if (p._count.collectionMemberships === 0) w.push("No collections");
  const score = p.confidenceScores[0];
  if (score && (score.level === "LOW" || score.overallScore < 0.45)) w.push("Low confidence");
  if (p.isAvailable === false) w.push("Unavailable");
  if (p.duplicateHandle) w.push("Dup handle");
  return w;
}

export function platformsLabel(platforms: Platform[] | string[]): string {
  if (!platforms?.length) return "—";
  return platforms.join(", ");
}
