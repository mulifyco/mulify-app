import prisma from "@/lib/prisma";
import { canonicalDiscoveryStoreDomain, isBlockedDiscoveryDomain } from "@/lib/intelligence/discovery-coverage";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let cachedSystemSourceId: string | null | undefined;
async function resolveSystemSourceId(): Promise<string> {
  if (cachedSystemSourceId !== undefined) return cachedSystemSourceId ?? "feedback_system";
  const row = await prisma.source.findFirst({ select: { id: true }, orderBy: { createdAt: "asc" } }).catch(() => null);
  cachedSystemSourceId = row?.id ?? "feedback_system";
  return cachedSystemSourceId;
}

export async function enqueueCompareRivalCandidates(params: {
  domains: string[];
  scoreHint?: number;
  reason?: string;
  perRequestCap?: number;
}): Promise<{ enqueued: number; suppressed: number }> {
  const perRequestCap = Math.max(1, Math.min(25, params.perRequestCap ?? 8));
  const cooldownHours = intFromEnv("FEEDBACK_DOMAIN_COOLDOWN_HOURS", 24);
  const cooldownAfter = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
  const systemSourceId = await resolveSystemSourceId();

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const raw of params.domains) {
    const d = canonicalDiscoveryStoreDomain(raw);
    if (!d) continue;
    if (isBlockedDiscoveryDomain(d)) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    uniq.push(d);
    if (uniq.length >= perRequestCap) break;
  }
  if (!uniq.length) return { enqueued: 0, suppressed: 0 };

  const [existingSources, existingCandidates] = await Promise.all([
    prisma.source.findMany({ where: { type: "SHOPIFY_DOMAIN", domain: { in: uniq } }, select: { domain: true } }).catch(() => []),
    prisma.discoveryCandidate
      .findMany({ where: { domain: { in: uniq } }, select: { domain: true, updatedAt: true } })
      .catch(() => []),
  ]);
  const sourceSet = new Set(existingSources.map((s) => String(s.domain ?? "")));
  const candMap = new Map(existingCandidates.map((c) => [c.domain, c.updatedAt]));

  let enqueued = 0;
  let suppressed = 0;

  const score = Math.max(0, Math.min(100, Number(params.scoreHint ?? 76)));
  const discoveryReason = params.reason?.trim() || "Feedback seed (compare rival) — high momentum/score compare result.";

  for (const d of uniq) {
    if (sourceSet.has(d)) {
      suppressed += 1;
      continue;
    }
    const prevUpdated = candMap.get(d);
    if (prevUpdated && prevUpdated.getTime() >= cooldownAfter.getTime()) {
      suppressed += 1;
      continue;
    }
    const ok = await prisma.discoveryCandidate
      .upsert({
        where: { domain: d },
        create: {
          domain: d,
          sourceTypeHint: "COMPARE_RIVAL",
          discoveryScore: score,
          discoveryReason,
          discoveredFromSourceId: systemSourceId,
          rawEvidenceCount: 0,
          isPromoted: false,
        },
        update: {
          sourceTypeHint: "COMPARE_RIVAL",
          discoveryScore: score,
          discoveryReason,
          discoveredFromSourceId: systemSourceId,
          updatedAt: new Date(),
        },
        select: { id: true },
      })
      .catch(() => null);
    if (ok) enqueued += 1;
  }

  return { enqueued, suppressed };
}

