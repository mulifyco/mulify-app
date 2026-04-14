import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jsonWithReadCache } from "@/lib/http/read-cache";
import { SavedBoardFilterRepository } from "@/server/repositories/saved-board-filter.repository";
import { parseBoardType } from "@/lib/boards/saved-board-filter";
import type { Platform } from "@prisma/client";
import { canAccessFeature, getPlanLimits, getUserPlan, paywallResponse } from "@/lib/billing/access";
import prisma from "@/lib/prisma";
import { trackPaywallHitFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

const PLATFORMS = [
  "FACEBOOK",
  "INSTAGRAM",
  "AUDIENCE_NETWORK",
  "MESSENGER",
  "META",
  "SHOPIFY",
  "TIKTOK",
  "UNKNOWN",
] as const satisfies readonly Platform[];

function parsePlatform(raw: unknown): Platform | null | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return null;
  return PLATFORMS.includes(raw as Platform) ? (raw as Platform) : null;
}

function parseOptionalFloat(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const items = await SavedBoardFilterRepository.list(workspaceId);
  return jsonWithReadCache({ items });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const plan = getUserPlan(session);
  if (!canAccessFeature(plan, "SAVED_FILTERS") || !canAccessFeature(plan, "ALERTS")) {
    await trackPaywallHitFromSession(session, "SAVED_FILTERS", "/api/boards/saved-filters");
    return NextResponse.json(paywallResponse("SAVED_FILTERS", plan), { status: 403 });
  }

  const limits = getPlanLimits(plan);
  if (limits.maxSavedFilters > 0) {
    const count = await prisma.savedBoardFilter.count({ where: { workspaceId } }).catch(() => 0);
    if (count >= limits.maxSavedFilters) {
      return NextResponse.json(
        { error: `Saved filter limit reached (max ${limits.maxSavedFilters}).`, code: "LIMIT", plan },
        { status: 403 }
      );
    }
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const boardType = parseBoardType(body.boardType);
  if (!boardType) return NextResponse.json({ error: "Invalid boardType" }, { status: 400 });

  const minScore = parseOptionalFloat(body.minScore);
  const minStores = parseOptionalInt(body.minStores);
  const maxSaturation = parseOptionalFloat(body.maxSaturation);
  const platformRaw = parsePlatform(body.platform);
  if (body.platform != null && body.platform !== "" && platformRaw === null) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const isEnabled =
    typeof body.isEnabled === "boolean" ? body.isEnabled : body.isEnabled === undefined ? true : undefined;
  if (isEnabled !== undefined && typeof isEnabled !== "boolean") {
    return NextResponse.json({ error: "isEnabled must be boolean" }, { status: 400 });
  }

  const created = await SavedBoardFilterRepository.create({
    workspaceId,
    name,
    boardType,
    minScore: minScore === undefined ? null : minScore,
    minStores: minStores === undefined ? null : minStores,
    maxSaturation: maxSaturation === undefined ? null : maxSaturation,
    platform: platformRaw === undefined ? null : platformRaw,
    isEnabled: isEnabled ?? true,
  });

  return NextResponse.json({ item: created }, { status: 201 });
}
