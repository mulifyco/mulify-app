import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SavedBoardFilterRepository } from "@/server/repositories/saved-board-filter.repository";
import { parseBoardType } from "@/lib/boards/saved-board-filter";
import type { Platform } from "@prisma/client";
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

function parsePlatformPatch(raw: unknown): Platform | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  return PLATFORMS.includes(raw as Platform) ? (raw as Platform) : undefined;
}

function parseOptionalFloatPatch(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  return Number.isFinite(n) ? n : undefined;
}

function parseOptionalIntPatch(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : undefined;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const existing = await SavedBoardFilterRepository.findById(workspaceId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Parameters<typeof SavedBoardFilterRepository.update>[2] = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    patch.name = body.name.trim();
  }

  if (body.boardType !== undefined) {
    const bt = parseBoardType(body.boardType);
    if (!bt) return NextResponse.json({ error: "Invalid boardType" }, { status: 400 });
    patch.boardType = bt;
  }

  if (body.minScore !== undefined) {
    const v = parseOptionalFloatPatch(body.minScore);
    if (v === undefined && body.minScore !== null && body.minScore !== "") {
      return NextResponse.json({ error: "Invalid minScore" }, { status: 400 });
    }
    patch.minScore = v === undefined ? undefined : v;
  }

  if (body.minStores !== undefined) {
    const v = parseOptionalIntPatch(body.minStores);
    if (v === undefined && body.minStores !== null && body.minStores !== "") {
      return NextResponse.json({ error: "Invalid minStores" }, { status: 400 });
    }
    patch.minStores = v === undefined ? undefined : v;
  }

  if (body.maxSaturation !== undefined) {
    const v = parseOptionalFloatPatch(body.maxSaturation);
    if (v === undefined && body.maxSaturation !== null && body.maxSaturation !== "") {
      return NextResponse.json({ error: "Invalid maxSaturation" }, { status: 400 });
    }
    patch.maxSaturation = v === undefined ? undefined : v;
  }

  if (body.platform !== undefined) {
    const p = parsePlatformPatch(body.platform);
    if (body.platform !== null && body.platform !== "" && p === undefined) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }
    patch.platform = p === undefined ? undefined : p;
  }

  if (body.isEnabled !== undefined) {
    if (typeof body.isEnabled !== "boolean") {
      return NextResponse.json({ error: "isEnabled must be boolean" }, { status: 400 });
    }
    patch.isEnabled = body.isEnabled;
  }

  const updated = await SavedBoardFilterRepository.update(workspaceId, id, patch);
  return NextResponse.json({ item: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const existing = await SavedBoardFilterRepository.findById(workspaceId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await SavedBoardFilterRepository.delete(workspaceId, id);
  return NextResponse.json({ ok: true });
}
