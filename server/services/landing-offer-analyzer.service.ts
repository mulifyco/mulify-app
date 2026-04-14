import prisma from "@/lib/prisma";

export type OfferAnalyzerPayload = {
  offerStrengthScore: number; // 0–100
  conversionClarityScore: number; // 0–100
  pricingAngle: string;
  ctaQuality: string;
  urgencySignals: string[];
  socialProofSignals: string[];
  trustSignals: string[];
  bundleSignals: string[];
  offerSummary: string;
  weaknesses: string[];
  recommendations: string[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function normText(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function stringifySafe(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return "";
  }
}

function hasAny(text: string, patterns: Array<string | RegExp>): boolean {
  for (const p of patterns) {
    if (typeof p === "string") {
      if (text.includes(p)) return true;
    } else {
      if (p.test(text)) return true;
    }
  }
  return false;
}

function scoreCta(text: string): { score: number; label: string } {
  const t = normText(text);
  const strong = [
    "buy now",
    "add to cart",
    "add to bag",
    "get yours",
    "shop now",
    "get offer",
    "claim",
    "checkout",
  ];
  const weak = ["learn more", "discover", "see more", "view", "read more"];
  const hasStrong = hasAny(t, strong);
  const hasWeak = hasAny(t, weak);
  if (hasStrong && !hasWeak) return { score: 85, label: "Strong (direct purchase CTA)" };
  if (hasStrong && hasWeak) return { score: 70, label: "Mixed (purchase + info CTAs)" };
  if (hasWeak) return { score: 45, label: "Weak (info-first CTA)" };
  return { score: 55, label: "Unknown (CTA not detected)" };
}

function analyzeOfferSignals(input: {
  title?: string | null;
  description?: string | null;
  h1?: string | null;
  url?: string | null;
  rawText: string;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
}): OfferAnalyzerPayload {
  const raw = normText(input.rawText);
  const title = normText(input.title ?? "");
  const desc = normText(input.description ?? "");
  const h1 = normText(input.h1 ?? "");
  const url = normText(input.url ?? "");

  const urgencySignals: string[] = [];
  const socialProofSignals: string[] = [];
  const trustSignals: string[] = [];
  const bundleSignals: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  // Discount / compare-at / savings
  const discount = hasAny(raw, [
    "compare_at_price",
    "compare-at",
    "was ",
    "now ",
    /save\s+\$?\d+/,
    /\b\d+%\s*(off|discount)\b/,
    /\b(sale|clearance|deal)\b/,
  ]);

  // Bundle / quantity offers
  const bundle = hasAny(raw, [
    "bundle",
    "2+1",
    "3+2",
    "buy more",
    "buy 2",
    "buy 3",
    "multi-pack",
    "subscribe",
    "subscription",
    /buy\s+\d+\s+(get|and)\s+\d+/,
  ]);
  if (bundle) bundleSignals.push("Bundle / quantity incentive detected");

  // Shipping / guarantee / returns
  const freeShipping = hasAny(raw, ["free shipping", "shipping free", "free delivery"]);
  if (freeShipping) trustSignals.push("Free shipping mentioned");
  const guarantee = hasAny(raw, ["guarantee", "money back", "risk-free", "30-day", "refund"]);
  if (guarantee) trustSignals.push("Guarantee / refund policy mentioned");
  const returns = hasAny(raw, ["returns", "return policy", "easy returns"]);
  if (returns) trustSignals.push("Returns policy mentioned");

  // Social proof
  const reviews = hasAny(raw, ["reviews", "review", "rated", "rating", "stars", "testimonials", "ugc"]);
  const reviewCount = /(\d{2,6})\s*(reviews|ratings)/.exec(raw);
  if (reviews) socialProofSignals.push(reviewCount ? `${reviewCount[1]} reviews/ratings mentioned` : "Reviews/testimonials mentioned");

  // Urgency
  const countdown = hasAny(raw, ["countdown", "ends in", "hours left", "minutes left"]);
  const scarcity = hasAny(raw, ["limited stock", "only", "left in stock", "low stock", "selling fast"]);
  if (countdown) urgencySignals.push("Countdown / time-based urgency detected");
  if (scarcity) urgencySignals.push("Scarcity / stock urgency detected");

  // Trust badges / payment
  const payments = hasAny(raw, ["visa", "mastercard", "amex", "paypal", "klarna", "afterpay", "shop pay", "secure checkout"]);
  if (payments) trustSignals.push("Payment / secure checkout cues detected");

  // Landing vs product page heuristics
  const isProductPage = hasAny(url, ["/products/", "product"]);
  const isLandingish = hasAny(url, ["/pages/", "/lp", "landing", "offer"]);

  const copyLen = raw.length;
  const shortCopy = copyLen > 0 && copyLen < 800;
  const longCopy = copyLen >= 2500;

  // Pricing angle
  let pricingAngle = "Standard pricing";
  if (discount) pricingAngle = "Discount-led (compare-at / savings)";
  else if (bundle) pricingAngle = "Bundle-led (value stack / multi-pack)";
  else if (guarantee) pricingAngle = "Risk-reversal-led (guarantee)";

  // Offer strength scoring
  let offer = 40;
  if (discount) offer += 18;
  if (bundle) offer += 16;
  if (freeShipping) offer += 10;
  if (guarantee) offer += 10;
  if (reviews) offer += 10;
  if (urgencySignals.length) offer += 8;
  offer = clamp(offer, 0, 100);

  // Conversion clarity scoring
  const cta = scoreCta(raw);
  let clarity = 45;
  if ((input.title ?? "").trim()) clarity += 6;
  if ((input.h1 ?? "").trim()) clarity += 8;
  if (!longCopy) clarity += 6;
  if (shortCopy) clarity += 6;
  if (payments) clarity += 6;
  if (isProductPage) clarity += 4;
  if (isLandingish) clarity += 2;
  clarity += Math.round((cta.score - 55) * 0.35);
  clarity = clamp(clarity, 0, 100);

  if (!discount && !bundle && !guarantee) {
    weaknesses.push("Offer is not clearly differentiated (no discount/bundle/guarantee cues found).");
    recommendations.push("Add a clear value stack: bundle, bonus, or guarantee (one primary lever).");
  }
  if (!reviews) {
    weaknesses.push("Weak social proof signals.");
    recommendations.push("Add reviews/testimonials above the fold and near the CTA.");
  }
  if (!urgencySignals.length) {
    weaknesses.push("No urgency/scarcity detected.");
    recommendations.push("Add a compliant urgency lever (shipping cutoff, limited bonus, or stock indicator).");
  }
  if (cta.score < 60) {
    weaknesses.push("CTA clarity may be weak.");
    recommendations.push("Use a direct CTA near the hero: “Add to cart” / “Get offer” + repeat near proof.");
  }
  if (longCopy && !reviews) {
    recommendations.push("Break long copy with proof blocks: demo GIFs, review snippets, and comparison table.");
  }

  const offerSummaryParts: string[] = [];
  offerSummaryParts.push(discount ? "Discount present" : "No discount cue");
  offerSummaryParts.push(bundle ? "bundle/value stack" : "no bundle cue");
  offerSummaryParts.push(guarantee ? "risk reversal" : "no guarantee cue");
  offerSummaryParts.push(reviews ? "social proof" : "weak proof");
  offerSummaryParts.push(urgencySignals.length ? "urgency" : "no urgency");

  const offerSummary = `${offerSummaryParts.join(" · ")}. (${isProductPage ? "Product page" : isLandingish ? "Landing page" : "Page"} heuristics)`;

  return {
    offerStrengthScore: offer,
    conversionClarityScore: clarity,
    pricingAngle,
    ctaQuality: cta.label,
    urgencySignals,
    socialProofSignals,
    trustSignals,
    bundleSignals,
    offerSummary,
    weaknesses,
    recommendations,
  };
}

async function textFromProduct(productId: string) {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: { store: true, entityLinks: { include: { rawRecord: { select: { rawPayload: true } } } } },
  });
  if (!p) return null;
  const raw = [
    p.title,
    p.description ?? "",
    stringifySafe(p.metadata),
    ...((p.entityLinks ?? []).map((l) => stringifySafe((l as any)?.rawRecord?.rawPayload)) ?? []),
  ].join("\n");
  return { title: p.title, description: p.description, h1: null as string | null, url: p.url, rawText: raw, priceMin: p.priceMin, priceMax: p.priceMax, currency: p.currency ?? p.store.currency ?? null };
}

async function textFromLandingPage(lpId: string) {
  const lp = await prisma.landingPage.findUnique({ where: { id: lpId } });
  if (!lp) return null;
  const raw = [
    lp.url,
    lp.title ?? "",
    lp.description ?? "",
    lp.ogTitle ?? "",
    lp.ogDescription ?? "",
    lp.h1Text ?? "",
    stringifySafe(lp.metadata),
  ].join("\n");
  return { title: lp.title, description: lp.description ?? lp.ogDescription ?? null, h1: lp.h1Text, url: lp.url, rawText: raw, priceMin: null, priceMax: null, currency: null };
}

async function textFromStore(storeId: string) {
  const s = await prisma.store.findUnique({ where: { id: storeId } });
  if (!s) return null;
  const topProducts = await prisma.product.findMany({
    where: { storeId },
    orderBy: [{ prominenceScore: "desc" }, { lastSeenAt: "desc" }],
    take: 5,
    select: { title: true, description: true, priceMin: true, priceMax: true, metadata: true, url: true },
  }).catch(() => []);
  const lps = await prisma.landingPage.findMany({
    where: { entityLinks: { some: { storeId } } },
    orderBy: { lastSeenAt: "desc" },
    take: 3,
    select: { url: true, title: true, ogTitle: true, ogDescription: true, h1Text: true, metadata: true },
  }).catch(() => []);

  const raw = [
    s.domain,
    s.name ?? "",
    s.description ?? "",
    s.metaTitle ?? "",
    s.metaDescription ?? "",
    stringifySafe(s.metadata),
    ...topProducts.map((p) => [p.title, p.description ?? "", stringifySafe(p.metadata), p.url].join("\n")),
    ...lps.map((lp) => [lp.url, lp.title ?? "", lp.ogTitle ?? "", lp.ogDescription ?? "", lp.h1Text ?? "", stringifySafe(lp.metadata)].join("\n")),
  ].join("\n");

  return { title: s.name ?? s.domain, description: s.description ?? s.metaDescription ?? null, h1: null as string | null, url: `https://${s.domain}`, rawText: raw, priceMin: null, priceMax: null, currency: s.currency ?? null };
}

async function textFromProductCluster(clusterId: string) {
  const m = await prisma.productClusterMember.findFirst({
    where: { clusterId },
    select: { productId: true },
  });
  if (!m?.productId) return null;
  return textFromProduct(m.productId);
}

export async function offerAnalyzerEntity(params: { entityType: string; entityId: string }): Promise<OfferAnalyzerPayload | null> {
  const t = params.entityType.trim().toUpperCase();
  const id = params.entityId.trim();
  if (!t || !id) return null;

  const src =
    t === "PRODUCT"
      ? await textFromProduct(id)
      : t === "LANDING_PAGE"
        ? await textFromLandingPage(id)
        : t === "STORE"
          ? await textFromStore(id)
          : t === "PRODUCT_CLUSTER"
            ? await textFromProductCluster(id)
            : null;
  if (!src) return null;
  return analyzeOfferSignals(src);
}

