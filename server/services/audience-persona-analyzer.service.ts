import prisma from "@/lib/prisma";

export type PersonaLabel =
  | "Problem Aware Impulse Buyer"
  | "Rational Optimizer"
  | "Gift Buyer"
  | "Vanity / Beauty Buyer"
  | "Health Concern Buyer"
  | "Convenience Seeker"
  | "Hobby / Enthusiast"
  | "Trend Chaser";

export type AwarenessStage = "UNWARE" | "PROBLEM_AWARE" | "SOLUTION_AWARE" | "PRODUCT_AWARE" | "MOST_AWARE";
export type BuyingIntent = "IMPULSE" | "CONSIDERATION" | "RESEARCH";

export type PersonaAnalyzerPayload = {
  primaryPersona: PersonaLabel;
  secondaryPersonas: PersonaLabel[];
  awarenessStage: AwarenessStage;
  buyingIntent: BuyingIntent;
  corePainPoints: string[];
  emotionalTriggers: string[];
  rationalTriggers: string[];
  bestCreativeAngles: string[];
  messagingWarnings: string[];
  audienceSummary: string;
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
    } else if (p.test(text)) {
      return true;
    }
  }
  return false;
}

function deterministicPick(seed: string, items: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return items[h % items.length]!;
}

function computePersona(params: {
  seed: string;
  text: string;
  pricePoint: number | null;
  platformHint?: string | null;
}): PersonaAnalyzerPayload {
  const t = normText(params.text);
  const price = params.pricePoint;
  const platform = (params.platformHint ?? "").toUpperCase();

  // Offer/urgency/proof cues
  const urgency = hasAny(t, ["limited", "ends", "countdown", "hours left", "low stock", "selling fast", "only"]);
  const discount = hasAny(t, ["sale", "discount", "save", "% off", /save\s+\$?\d+/]);
  const guarantee = hasAny(t, ["guarantee", "money back", "risk-free", "refund", "returns"]);
  const reviews = hasAny(t, ["reviews", "ratings", "stars", "testimonials", "ugc"]);
  const demo = hasAny(t, ["demo", "watch", "see it", "before/after", "results", "proof"]);
  const subscription = hasAny(t, ["subscribe", "subscription"]);

  // Category semantics (very lightweight)
  const beauty = hasAny(t, ["beauty", "skin", "skincare", "hair", "lashes", "nails", "makeup", "glow"]);
  const health = hasAny(t, ["health", "pain", "sleep", "stress", "anxiety", "posture", "back", "joint", "supplement"]);
  const gift = hasAny(t, ["gift", "perfect for", "for him", "for her", "mother's day", "father's day", "birthday"]);
  const hobby = hasAny(t, ["gaming", "golf", "fishing", "camping", "cycling", "gym", "pet", "cats", "dogs", "craft"]);
  const convenience = hasAny(t, ["easy", "fast", "quick", "no mess", "in minutes", "simple", "hands-free", "one click"]);
  const trend = hasAny(t, ["tiktok", "viral", "trending", "everyone", "must-have", "new", "just dropped"]);

  // CTA / purchase mode
  const directCta = hasAny(t, ["buy now", "add to cart", "get yours", "shop now", "checkout", "claim"]);
  const infoCta = hasAny(t, ["learn more", "discover", "read more", "see details"]);

  // Intent + awareness heuristics
  let buyingIntent: BuyingIntent = "CONSIDERATION";
  if (directCta && (urgency || discount) && (platform === "TIKTOK" || trend)) buyingIntent = "IMPULSE";
  else if (infoCta && (hasAny(t, ["compare", "ingredients", "specs", "how it works", "research"]) || (price != null && price >= 120)))
    buyingIntent = "RESEARCH";

  let awarenessStage: AwarenessStage = "SOLUTION_AWARE";
  if (hasAny(t, ["what is", "why does", "how does it work", "the science", "mechanism"])) awarenessStage = "PROBLEM_AWARE";
  if (hasAny(t, ["compare", "vs", "better than", "alternatives"])) awarenessStage = "PRODUCT_AWARE";
  if (discount || urgency || hasAny(t, ["today only", "last chance"])) awarenessStage = "MOST_AWARE";
  if (!directCta && !infoCta) awarenessStage = "UNWARE";

  // Persona scoring
  const scores = new Map<PersonaLabel, number>([
    ["Problem Aware Impulse Buyer", 0],
    ["Rational Optimizer", 0],
    ["Gift Buyer", 0],
    ["Vanity / Beauty Buyer", 0],
    ["Health Concern Buyer", 0],
    ["Convenience Seeker", 0],
    ["Hobby / Enthusiast", 0],
    ["Trend Chaser", 0],
  ]);
  const bump = (p: PersonaLabel, n: number) => scores.set(p, (scores.get(p) ?? 0) + n);

  if (beauty) bump("Vanity / Beauty Buyer", 4);
  if (health) bump("Health Concern Buyer", 4);
  if (gift) bump("Gift Buyer", 4);
  if (hobby) bump("Hobby / Enthusiast", 3);
  if (convenience) bump("Convenience Seeker", 3);
  if (trend || platform === "TIKTOK") bump("Trend Chaser", 2);

  if (buyingIntent === "IMPULSE") bump("Problem Aware Impulse Buyer", 3);
  if (buyingIntent === "RESEARCH") bump("Rational Optimizer", 4);
  if (guarantee) bump("Rational Optimizer", 1);
  if (reviews) bump("Rational Optimizer", 1);
  if (demo) bump("Problem Aware Impulse Buyer", 1);
  if (discount) bump("Problem Aware Impulse Buyer", 1);
  if (subscription) bump("Rational Optimizer", 1);

  // price point nudges
  if (price != null) {
    if (price >= 120) bump("Rational Optimizer", 2);
    if (price <= 35) bump("Problem Aware Impulse Buyer", 1);
  }

  // Choose primary/secondary deterministically
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const topScore = sorted[0]?.[1] ?? 0;
  const tied = sorted.filter((x) => x[1] === topScore).map((x) => x[0]);
  const primary = (tied.length > 1 ? (deterministicPick(params.seed, tied) as PersonaLabel) : sorted[0]?.[0]) ?? "Rational Optimizer";
  const secondary = sorted
    .filter(([p]) => p !== primary)
    .filter(([, s]) => s >= Math.max(1, topScore - 2))
    .slice(0, 3)
    .map(([p]) => p);

  const corePainPoints: string[] = [];
  if (convenience) corePainPoints.push("Time/effort friction");
  if (health) corePainPoints.push("Health/pain discomfort");
  if (beauty) corePainPoints.push("Appearance/confidence gap");
  if (trend) corePainPoints.push("FOMO / staying current");
  if (!corePainPoints.length) corePainPoints.push("Outcome not achieved with current solution");

  const emotionalTriggers: string[] = [];
  if (trend || urgency) emotionalTriggers.push("FOMO / urgency");
  if (beauty) emotionalTriggers.push("Confidence / identity");
  if (gift) emotionalTriggers.push("Love / thoughtfulness");
  if (health) emotionalTriggers.push("Relief / safety");
  if (!emotionalTriggers.length) emotionalTriggers.push("Relief + progress");

  const rationalTriggers: string[] = [];
  if (reviews) rationalTriggers.push("Social proof (reviews/testimonials)");
  if (guarantee) rationalTriggers.push("Risk reversal (guarantee/returns)");
  if (discount) rationalTriggers.push("Savings/value framing");
  if (demo) rationalTriggers.push("Demonstrable proof");
  if (!rationalTriggers.length) rationalTriggers.push("Clear proof + simple value stack");

  const bestCreativeAngles: string[] = [];
  if (primary === "Trend Chaser") bestCreativeAngles.push("Viral POV + fast demo + ‘everyone’s doing this’ proof");
  if (primary === "Rational Optimizer") bestCreativeAngles.push("Problem → mechanism → proof → comparison → guarantee");
  if (primary === "Problem Aware Impulse Buyer") bestCreativeAngles.push("Pattern interrupt → bold claim → quick proof → urgency CTA");
  if (primary === "Convenience Seeker") bestCreativeAngles.push("Before/after time savings + ‘in minutes’ demo");
  if (primary === "Gift Buyer") bestCreativeAngles.push("Gift moment + unboxing + recipient reaction + bundle offer");
  if (primary === "Health Concern Buyer") bestCreativeAngles.push("Symptom relief story + credible proof + risk reversal");
  if (primary === "Vanity / Beauty Buyer") bestCreativeAngles.push("Transformation + routine + aesthetic proof + creator credibility");
  if (primary === "Hobby / Enthusiast") bestCreativeAngles.push("Use-case demo + niche jargon + performance proof");
  if (!bestCreativeAngles.length) bestCreativeAngles.push("Outcome-first demo + proof overlay + clean CTA");

  const messagingWarnings: string[] = [];
  if (buyingIntent === "IMPULSE" && price != null && price >= 120) messagingWarnings.push("High price vs impulse intent: add risk reversal and proof early.");
  if (!reviews) messagingWarnings.push("Weak social proof: add testimonials/reviews near first CTA.");
  if (urgency && !guarantee) messagingWarnings.push("Urgency-heavy page: ensure trust cues (returns/guarantee/secure checkout).");

  const audienceSummary = `${primary} · ${awarenessStage.replace(/_/g, " ").toLowerCase()} · intent ${buyingIntent.toLowerCase()}. Best angle: ${bestCreativeAngles[0] ?? "—"}.`;

  return {
    primaryPersona: primary,
    secondaryPersonas: secondary,
    awarenessStage,
    buyingIntent,
    corePainPoints,
    emotionalTriggers,
    rationalTriggers,
    bestCreativeAngles,
    messagingWarnings,
    audienceSummary,
  };
}

async function sourceFromProduct(productId: string) {
  const p = await prisma.product.findUnique({
    where: { id: productId },
    include: { store: true, entityLinks: { include: { rawRecord: { select: { rawPayload: true } } } } },
  });
  if (!p) return null;
  const text = [
    p.title,
    p.description ?? "",
    stringifySafe(p.metadata),
    ...((p.entityLinks ?? []).map((l) => stringifySafe((l as any)?.rawRecord?.rawPayload)) ?? []),
  ].join("\n");
  const pricePoint =
    p.priceMin != null || p.priceMax != null ? (Number(p.priceMin ?? p.priceMax ?? 0) + Number(p.priceMax ?? p.priceMin ?? 0)) / 2 : null;
  return { seed: `PRODUCT:${p.id}`, text, pricePoint, platformHint: null as string | null };
}

async function sourceFromLandingPage(lpId: string) {
  const lp = await prisma.landingPage.findUnique({ where: { id: lpId } });
  if (!lp) return null;
  const text = [
    lp.url,
    lp.title ?? "",
    lp.description ?? "",
    lp.ogTitle ?? "",
    lp.ogDescription ?? "",
    lp.h1Text ?? "",
    stringifySafe(lp.metadata),
  ].join("\n");
  return { seed: `LANDING_PAGE:${lp.id}`, text, pricePoint: null as number | null, platformHint: null as string | null };
}

async function sourceFromStore(storeId: string) {
  const s = await prisma.store.findUnique({ where: { id: storeId } });
  if (!s) return null;
  const topProducts = await prisma.product
    .findMany({
      where: { storeId },
      orderBy: [{ prominenceScore: "desc" }, { lastSeenAt: "desc" }],
      take: 5,
      select: { title: true, description: true, priceMin: true, priceMax: true, metadata: true, url: true },
    })
    .catch(() => []);
  const lps = await prisma.landingPage
    .findMany({
      where: { entityLinks: { some: { storeId } } },
      orderBy: { lastSeenAt: "desc" },
      take: 3,
      select: { url: true, title: true, ogTitle: true, ogDescription: true, h1Text: true, metadata: true },
    })
    .catch(() => []);

  const text = [
    s.domain,
    s.name ?? "",
    s.description ?? "",
    s.metaTitle ?? "",
    s.metaDescription ?? "",
    stringifySafe(s.metadata),
    ...topProducts.map((p) => [p.title, p.description ?? "", stringifySafe(p.metadata), p.url].join("\n")),
    ...lps.map((lp) => [lp.url, lp.title ?? "", lp.ogTitle ?? "", lp.ogDescription ?? "", lp.h1Text ?? "", stringifySafe(lp.metadata)].join("\n")),
  ].join("\n");

  // store-level price hint: average of top product midpoints
  const mids = topProducts
    .map((p) =>
      p.priceMin != null || p.priceMax != null ? (Number(p.priceMin ?? p.priceMax ?? 0) + Number(p.priceMax ?? p.priceMin ?? 0)) / 2 : null
    )
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const pricePoint = mids.length ? mids.reduce((a, b) => a + b, 0) / mids.length : null;

  return { seed: `STORE:${s.id}`, text, pricePoint, platformHint: null as string | null };
}

async function sourceFromProductCluster(clusterId: string) {
  const m = await prisma.productClusterMember.findFirst({ where: { clusterId }, select: { productId: true } });
  if (!m?.productId) return null;
  return sourceFromProduct(m.productId);
}

async function sourceFromCreativeCluster(clusterId: string) {
  const c = await prisma.creativeCluster.findUnique({ where: { id: clusterId }, select: { id: true, fingerprint: true, platform: true } });
  if (!c) return null;
  const text = [c.fingerprint, c.platform].join("\n");
  return { seed: `CREATIVE_CLUSTER:${c.id}`, text, pricePoint: null as number | null, platformHint: c.platform ?? null };
}

export async function personaAnalyzerEntity(params: { entityType: string; entityId: string }): Promise<PersonaAnalyzerPayload | null> {
  const t = params.entityType.trim().toUpperCase();
  const id = params.entityId.trim();
  if (!t || !id) return null;

  const src =
    t === "PRODUCT"
      ? await sourceFromProduct(id)
      : t === "LANDING_PAGE"
        ? await sourceFromLandingPage(id)
        : t === "STORE"
          ? await sourceFromStore(id)
          : t === "PRODUCT_CLUSTER"
            ? await sourceFromProductCluster(id)
            : t === "CREATIVE_CLUSTER"
              ? await sourceFromCreativeCluster(id)
              : null;

  if (!src) return null;
  return computePersona(src);
}

