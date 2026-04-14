/**
 * Hook intelligence helpers: canonicalize noisy hook phrases and map them to an angle taxonomy.
 * Deterministic + multilingual-tolerant (best-effort).
 */

export type AngleType =
  | "pain"
  | "vanity"
  | "urgency"
  | "social_proof"
  | "curiosity"
  | "convenience"
  | "problem_solution"
  | "before_after"
  | "authority"
  | "trend_viral"
  | "gift_surprise"
  | "other";

const STOPWORDS = new Set(
  [
    // EN
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "to",
    "of",
    "for",
    "in",
    "on",
    "with",
    "your",
    "you",
    "my",
    "our",
    "this",
    "that",
    "it",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "as",
    "at",
    "from",
    "by",
    "now",
    "today",
    // TR (light)
    "ve",
    "ile",
    "bir",
    "bu",
    "şu",
    "icin",
    "için",
    "sen",
    "sana",
    "siz",
    "sizin",
    "ben",
    "biz",
    "hemen",
    "simdi",
    "şimdi",
  ].map((s) => s.toLowerCase())
);

const CTA_PHRASES = [
  "buy now",
  "shop now",
  "get yours",
  "add to cart",
  "learn more",
  "tap to shop",
  "order now",
  "claim",
  "checkout",
  "link in bio",
  "click the link",
  "shop the link",
  "follow for",
  "save this",
  "watch till the end",
  "wait for it",
  "part 1",
  "part 2",
];

function stripEmojiLike(s: string): string {
  // Remove most symbols/emoji while preserving letters/numbers/spaces.
  return s.replace(/[^\p{L}\p{N}\s'’\-]+/gu, " ");
}

function normalizeSlang(s: string): string {
  return s
    .replace(/\b(fyp|tiktok|reels|ig|instagram)\b/gi, " ")
    .replace(/\b(omg|lol|wtf|asap)\b/gi, " ")
    .replace(/\b(smh|idk|fr)\b/gi, " ")
    .replace(/\b(viral|trending)\b/gi, " viral ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCtaSuffix(s: string): string {
  let out = s;
  for (const p of CTA_PHRASES) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b.*$`, "i");
    out = out.replace(re, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

function tokens(s: string): string[] {
  const t = s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\p{L}\p{N}_-]+/gu, " ")
    .replace(/\b\d{1,3}%\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return [];
  const raw = t.split(" ").map((x) => x.trim()).filter(Boolean);
  const filtered = raw
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length >= 3 && w.length <= 24)
    .filter((w) => !STOPWORDS.has(w));
  return filtered.slice(0, 12);
}

export function canonicalHook(raw: string | null | undefined): string | null {
  const input = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!input) return null;
  let s = stripEmojiLike(input);
  s = normalizeSlang(s);
  s = stripCtaSuffix(s);
  s = s.replace(/\b(free|shipping|delivery)\b/gi, " free_shipping "); // keep as signal token
  s = s.replace(/\s+/g, " ").trim();
  const toks = tokens(s);
  if (toks.length < 2) return null;
  const joined = toks.join(" ");
  // Ignore CTA-only low-signal hooks
  if (joined.length < 8) return null;
  return joined.slice(0, 80);
}

export function nearDuplicateKey(canon: string): string {
  // Token-set signature (orderless) to merge minor punctuation/stopword differences.
  const set = [...new Set(tokens(canon))].sort();
  return set.join("|").slice(0, 140);
}

export function angleTypeForHook(canon: string): AngleType {
  const t = ` ${canon.toLowerCase()} `;

  const has = (arr: Array<string | RegExp>) =>
    arr.some((p) => (typeof p === "string" ? t.includes(` ${p} `) : p.test(t)));

  if (has(["only", "limited", "ends", "today", "last", "hours", "left", /low\s+stock/])) return "urgency";
  if (has(["reviews", "rated", "stars", "testimonials", "ugc", "trusted"])) return "social_proof";
  if (has(["before", "after", "transform", "results", "glow", "lost", "gain"])) return "before_after";
  if (has(["doctor", "dermatologist", "clinically", "proven", "science", "tested", "expert"])) return "authority";
  if (has(["viral", "everyone", "fyp", "tiktok", "trend"])) return "trend_viral";
  if (has(["gift", "surprise", "perfect for", "unboxing"])) return "gift_surprise";
  if (has(["easy", "fast", "minutes", "simple", "no mess", "hands free"])) return "convenience";
  if (has(["problem", "pain", "stop", "fix", "struggle", "annoying", "worst"])) return "pain";
  if (has(["look", "beauty", "skin", "hair", "lashes", "confidence", "aesthetic"])) return "vanity";
  if (has(["why", "secret", "what if", "you won't believe", "nobody tells"])) return "curiosity";
  if (has(["how to", "solve", "solution", "works", "step"])) return "problem_solution";
  return "other";
}

export type HookPersonaBridge = {
  awarenessStage: "UNWARE" | "PROBLEM_AWARE" | "SOLUTION_AWARE" | "PRODUCT_AWARE" | "MOST_AWARE";
  buyingIntent: "IMPULSE" | "CONSIDERATION" | "RESEARCH";
  emotionalTrigger: string;
  rationalTrigger: string;
};

export function personaBridgeForHook(canon: string, angle: AngleType): HookPersonaBridge {
  const t = canon.toLowerCase();
  const has = (s: string) => t.includes(s);

  let awarenessStage: HookPersonaBridge["awarenessStage"] = "SOLUTION_AWARE";
  if (has("what") || has("why") || has("how")) awarenessStage = "PROBLEM_AWARE";
  if (has("vs") || has("compare") || has("better")) awarenessStage = "PRODUCT_AWARE";
  if (angle === "urgency" || has("today") || has("last")) awarenessStage = "MOST_AWARE";

  let buyingIntent: HookPersonaBridge["buyingIntent"] = "CONSIDERATION";
  if (angle === "urgency" || has("off") || has("save")) buyingIntent = "IMPULSE";
  if (angle === "authority" || has("science") || has("tested")) buyingIntent = "RESEARCH";

  const emotionalTrigger =
    angle === "trend_viral"
      ? "FOMO"
      : angle === "vanity"
        ? "Identity/confidence"
        : angle === "pain"
          ? "Relief"
          : angle === "gift_surprise"
            ? "Delight"
            : angle === "urgency"
              ? "Urgency"
              : "Curiosity";

  const rationalTrigger =
    angle === "social_proof"
      ? "Social proof"
      : angle === "authority"
        ? "Authority proof"
        : angle === "before_after"
          ? "Demonstrable results"
          : angle === "convenience"
            ? "Simplicity"
            : "Value";

  return { awarenessStage, buyingIntent, emotionalTrigger, rationalTrigger };
}

