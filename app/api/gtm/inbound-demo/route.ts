import { NextRequest, NextResponse } from "next/server";
import { createInboundDemoLead } from "@/server/services/gtm.service";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, { n: number; reset: number }>();

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function allow(ip: string): boolean {
  const now = Date.now();
  const row = hits.get(ip);
  if (!row || now > row.reset) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (row.n >= MAX_PER_WINDOW) return false;
  row.n += 1;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!allow(ip)) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const company = typeof body.company === "string" ? body.company.trim() : "";
  if (!company || company.length > 200) {
    return NextResponse.json({ error: "company is required (max 200 chars)" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : undefined;
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : undefined;
  const website = typeof body.website === "string" ? body.website.trim().slice(0, 500) : undefined;
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : undefined;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    const fallbackWorkspaceId = await prisma.workspace
      .findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
      .then((r) => r?.id ?? null)
      .catch(() => null);
    if (!fallbackWorkspaceId) return NextResponse.json({ error: "No workspace available" }, { status: 500 });
    const res = await createInboundDemoLead({ workspaceId: fallbackWorkspaceId, company, name, email, website, message });
    return NextResponse.json({ ok: true, id: res.id, merged: res.merged });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
