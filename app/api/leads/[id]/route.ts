import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const b = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  for (const k of ["companyName", "contactEmail", "contactFormUrl", "instagramUrl", "tiktokUrl", "owner", "notes"]) {
    if (k in b) patch[k] = asString(b[k]);
  }
  if ("leadStage" in b) patch.leadStage = (asString(b.leadStage) ?? undefined) as any;
  if ("tags" in b) patch.tags = asStringArray(b.tags) ?? undefined;

  if ("estimatedPotentialScore" in b) {
    const n = Number(b.estimatedPotentialScore);
    patch.estimatedPotentialScore = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : undefined;
  }

  const exists = await prisma.lead.findFirst({ where: { id, workspaceId }, select: { id: true } }).catch(() => null);
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await prisma.lead.update({ where: { id }, data: patch as any }).catch(() => null);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: updated });
}

