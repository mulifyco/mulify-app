import prisma from "@/lib/prisma";

export type CampaignBriefPayload = {
  productAngle: string;
  winningHook: string;
  audienceHypothesis: string;
  offerIdea: string;
  landingPageDirection: string;
  creativeFormats: string[];
  riskNotes: string[];
  testIdeas: string[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function deterministicPick(seed: string, items: string[]): string {
  // deterministic-ish: stable across runs without importing crypto
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return items[h % items.length]!;
}

function briefBase(): CampaignBriefPayload {
  return {
    productAngle: "Direct-response angle focused on outcome + proof.",
    winningHook: "Pattern interrupt in first 2 seconds + bold claim + immediate proof.",
    audienceHypothesis: "People actively searching for a faster / easier way to solve the core pain.",
    offerIdea: "Starter bundle + limited-time bonus + clear guarantee.",
    landingPageDirection: "Short, skimmable page: claim → proof → mechanism → offer → FAQs → guarantee.",
    creativeFormats: ["UGC POV (15s)", "Problem → solution demo (20–30s)", "Before/after with proof overlay (10–15s)"],
    riskNotes: ["Verify claims and compliance. Avoid overpromising without proof."],
    testIdeas: ["Test 3 hooks × 2 offers × 2 creators (small budget) and scale only winners."],
  };
}

export async function campaignBriefEntity(params: { entityType: string; entityId: string }): Promise<CampaignBriefPayload | null> {
  const t = params.entityType.trim().toUpperCase();
  const id = params.entityId.trim();
  if (!t || !id) return null;

  if (t === "PRODUCT_CLUSTER") return campaignBriefProductCluster(id);
  if (t === "CREATIVE_CLUSTER") return campaignBriefCreativeCluster(id);
  if (t === "STORE") return campaignBriefStore(id);
  if (t === "WATCHLIST_ALERT") return campaignBriefWatchlistAlert(id);
  return null;
}

export async function campaignBriefProductCluster(clusterId: string): Promise<CampaignBriefPayload | null> {
  const c = await prisma.productCluster.findUnique({
    where: { id: clusterId },
    select: {
      id: true,
      title: true,
      readyToScaleScore: true,
      earlyMoverScore: true,
      saturationScore: true,
      saturatedScore: true,
      storeCount: true,
      linkedCreativeClusterCount: true,
      linkedRawRecordCount: true,
    },
  });
  if (!c) return null;

  const base = briefBase();
  const rts = Number(c.readyToScaleScore ?? 0);
  const em = Number(c.earlyMoverScore ?? 0);
  const sat = Math.max(Number(c.saturationScore ?? 0), Number(c.saturatedScore ?? 0));

  const angle =
    rts >= 72
      ? "Direct-response outcome angle (clear promise + proof + urgency)."
      : em >= 70
        ? "Novelty / trend angle (new discovery + early adoption + social proof)."
        : sat >= 80
          ? "Unique mechanism / repositioning angle (different explanation + different promise)."
          : "Core pain-to-outcome angle with simple proof."

  const hook =
    rts >= 72
      ? deterministicPick(clusterId, [
          "Stop scrolling—this is the fastest way to get the result (proof in 3 seconds).",
          "I tried everything… this finally worked (here’s the 1 change).",
          "If you struggle with the pain, do this first (watch the demo).",
        ])
      : em >= 70
        ? deterministicPick(clusterId, [
            "Everyone’s starting to use this—here’s why it’s blowing up.",
            "The new way to solve the pain (I didn’t expect this).",
            "POV: you discover the shortcut nobody told you about.",
          ])
        : sat >= 80
          ? deterministicPick(clusterId, [
              "Most people do it wrong—here’s the real mechanism that changes everything.",
              "Don’t buy this unless it does *this* (watch the test).",
              "The ‘secret’ isn’t the product—it’s how you use it (quick demo).",
            ])
          : base.winningHook;

  const audience = deterministicPick(clusterId, [
    "Busy buyers who want a faster, lower-effort solution and value proof.",
    "People who already tried alternatives and are ready to switch if convinced.",
    "Deal-sensitive buyers who need a simple, low-risk starter offer.",
  ]);

  const offer = rts >= 72
    ? "Core product + starter bundle + fast shipping + 30-day guarantee."
    : em >= 70
      ? "Low-friction starter offer + bonus guide + scarcity (limited batch)."
      : sat >= 80
        ? "Repositioned bundle (different use-case) + strong guarantee + social proof."
        : base.offerIdea;

  const landing = sat >= 80
    ? "Differentiation-first page: mechanism → proof → comparisons → offer → guarantee."
    : "Direct response page: hook/claim → proof → benefits → offer stack → FAQs → guarantee."

  const riskNotes = [
    ...(sat >= 80 ? ["High saturation: avoid 1:1 creative; differentiate mechanism and offer."] : []),
    ...(c.storeCount <= 1 ? ["Low distribution: validate with small tests before scaling."] : []),
    ...(c.linkedRawRecordCount < 5 ? ["Thin evidence: re-check after next sync and validate manually."] : []),
  ];

  const formats = [
    "UGC POV (15s): pain → discovery → quick proof → CTA",
    "Demo + overlay proof (10–20s): claim → demo → proof → CTA",
    "Problem-solution testimonial (20–30s): story → result → offer",
  ];

  const testIdeas = [
    "Hook test: 5 hooks × 1 creator × same offer (48h).",
    "Offer test: bundle vs single vs subscription (if applicable).",
    "Landing test: short vs mechanism-first (if saturated).",
    "Angle test: outcome vs mechanism vs novelty (if early movers).",
  ];

  return {
    productAngle: `${c.title ?? "Product cluster"} · ${angle}`,
    winningHook: hook,
    audienceHypothesis: audience,
    offerIdea: offer,
    landingPageDirection: landing,
    creativeFormats: formats,
    riskNotes,
    testIdeas,
  };
}

export async function campaignBriefCreativeCluster(clusterId: string): Promise<CampaignBriefPayload | null> {
  const c = await prisma.creativeCluster.findUnique({
    where: { id: clusterId },
    select: {
      id: true,
      fingerprint: true,
      platform: true,
      creativeWinnerScore: true,
      scaleScore: true,
      storeCount: true,
      saturationScore: true,
    },
  });
  if (!c) return null;

  const base = briefBase();
  const plat = String(c.platform ?? "UNKNOWN").toUpperCase();
  const saturated = Number(c.saturationScore ?? 0) >= 80;

  const productAngle =
    saturated
      ? "Derivative risk: keep the core promise but change mechanism, creator persona, and offer framing."
      : "Extract the core promise + proof pattern and build 3 variants (new creator + new offer + new demo).";

  const winningHook =
    plat === "TIKTOK"
      ? "TikTok UGC: 0–1s pattern interrupt, 1–3s claim, 3–8s proof/demo, 8–15s CTA."
      : "Meta: problem → tension → proof → testimonial → CTA (mid-scroll stopping).";

  const audienceHypothesis =
    plat === "TIKTOK"
      ? "Impulse + curiosity audience that responds to fast proof and creator authenticity."
      : "Consideration audience that responds to testimonials, comparisons, and credibility cues.";

  const offerIdea =
    plat === "TIKTOK"
      ? "Low-friction entry offer + bonus + limited drop urgency."
      : "Bundle + guarantee + ‘why us’ proof stack (reviews, results, comparisons).";

  const landingPageDirection =
    plat === "TIKTOK"
      ? "Fast-loading mobile page: hero video + 3 bullets + proof + offer + checkout."
      : "Credibility-first page: testimonials, comparison table, proof, FAQs, guarantee.";

  const formats =
    plat === "TIKTOK"
      ? ["UGC selfie demo (9–15s)", "POV skit (7–12s)", "Stitch/duet reaction (10–20s)"]
      : ["Problem/solution explainer (15–25s)", "Testimonial montage (15–30s)", "Offer stack graphic video (10–15s)"];

  const riskNotes = [
    ...(saturated ? ["High creative saturation: avoid copying; create new ‘why it works’ explanation."] : []),
    ...(c.storeCount < 2 ? ["Low store spread: verify this pattern generalizes before scaling."] : []),
  ];

  const testIdeas = [
    "Hook replication: rebuild the first 3 seconds in 3 different creator personas.",
    "Proof variant: demo vs testimonial vs comparison.",
    "CTA test: discount vs bonus vs guarantee-led CTA.",
  ];

  return {
    productAngle,
    winningHook,
    audienceHypothesis,
    offerIdea,
    landingPageDirection,
    creativeFormats: formats,
    riskNotes,
    testIdeas,
  };
}

export async function campaignBriefStore(storeId: string): Promise<CampaignBriefPayload | null> {
  const s = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, domain: true, trafficScore: true, winningProbabilityScore: true },
  });
  if (!s) return null;

  const lift = clamp(Number(s.trafficScore ?? 0) + Number(s.winningProbabilityScore ?? 0), 0, 100);

  const productAngle =
    lift >= 120
      ? "Storewide growth campaign: highlight 1–2 hero outcomes + bundle/upsell path."
      : "Storewide prospecting: hero product angle + retargeting with proof.";

  const winningHook = deterministicPick(storeId, [
    "If you’re buying this, don’t miss the bundle (best value) — quick proof first.",
    "What’s inside the bundle and why people rebuy (show proof + results).",
    "The 10-second reason this store is popping off (demo + proof overlay).",
  ]);

  const audienceHypothesis = "Visitors likely respond to hero product + bundle value + clear proof stack.";
  const offerIdea = "Hero product + bundle discount + post-purchase upsell (fast add-on).";
  const landingPageDirection = "Hero landing: main promise → best-seller bundle → proof → reviews → guarantee.";
  const creativeFormats = ["Bundle walkthrough (15–25s)", "Best-seller proof montage (10–20s)", "Creator unboxing (15s)"];
  const riskNotes = ["Ensure bundle pricing and margins support scaling. Avoid too many SKUs in one pitch."];
  const testIdeas = ["Prospecting: hero product angle vs bundle-first angle.", "Retargeting: testimonial vs comparison.", "Upsell: add-on A vs add-on B."];

  return {
    productAngle: `${s.domain} · ${productAngle}`,
    winningHook,
    audienceHypothesis,
    offerIdea,
    landingPageDirection,
    creativeFormats,
    riskNotes,
    testIdeas,
  };
}

export async function campaignBriefWatchlistAlert(alertId: string): Promise<CampaignBriefPayload | null> {
  const a = await prisma.watchlistAlertLog.findUnique({
    where: { id: alertId },
    select: { id: true, type: true, severity: true, title: true, message: true },
  });
  if (!a) return null;

  const base = briefBase();
  const t = String(a.type);

  const productAngle =
    t === "STORE_TREND_SPIKE"
      ? "Reactive counter-campaign: faster proof + stronger offer vs competitor momentum."
      : t === "CREATIVE_CLUSTER_SPIKE"
        ? "Angle defense: build fresh hooks to compete with competitor creative expansion."
        : t === "PRODUCT_CLUSTER_SPIKE"
          ? "Category response: highlight a sharper mechanism and differentiated promise."
          : t === "READY_TO_SCALE_APPEARED"
            ? "Fast response: direct-response campaign to capture demand window."
            : "Early response: novelty angle + light offer to test quickly.";

  const winningHook = deterministicPick(alertId, [
    "Competitors are pushing this—here’s the better way (quick proof).",
    "Before you buy theirs, watch this 8-second test.",
    "If you’ve seen this trending, here’s what actually matters (proof first).",
  ]);

  const riskNotes = [
    ...(a.severity === "HIGH" ? ["High urgency: move fast but keep tests controlled."] : []),
    "Avoid direct competitor naming; focus on differentiation and proof.",
  ];

  const testIdeas = [
    "Reactive hook test: 3 counter-hooks × same offer.",
    "Offer defense: stronger guarantee vs bonus vs bundle.",
    "Creative defense: new creator persona + new proof style (demo vs testimonial).",
  ];

  return {
    ...base,
    productAngle: `${a.title} · ${productAngle}`,
    winningHook,
    riskNotes,
    testIdeas,
  };
}

