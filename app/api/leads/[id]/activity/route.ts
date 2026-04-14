import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const b = body as Record<string, unknown>;
  const type = asString(b.type) ?? "NOTE";
  const note = asString(b.note);
  if (!note) return NextResponse.json({ error: "note is required" }, { status: 400 });

  const lead = await prisma.lead.findFirst({ where: { id, workspaceId }, select: { id: true } }).catch(() => null);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const created = await prisma.leadActivity.create({
    data: { leadId: id, type, note },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}

