import { NextResponse } from "next/server";
import { ProductEventType } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { suggestLeads } from "@/server/services/lead-intelligence.service";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";
import { getRequiredWorkspace } from "@/server/authz/workspace-scope";

export const dynamic = "force-dynamic";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const url = new URL(req.url);
  const stage = (url.searchParams.get("stage") ?? "").trim();
  const search = (url.searchParams.get("search") ?? "").trim();
  const includeSuggestions = url.searchParams.get("suggest") === "1";

  const where: any = { workspaceId };
  if (stage) where.leadStage = stage;
  if (search) {
    where.OR = [
      { domain: { contains: search, mode: "insensitive" } },
      { companyName: { contains: search, mode: "insensitive" } },
      { contactEmail: { contains: search, mode: "insensitive" } },
      { owner: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ];
  }

  const [leads, suggestions] = await Promise.all([
    prisma.lead
      .findMany({
        where,
        orderBy: [{ leadStage: "asc" }, { estimatedPotentialScore: "desc" }, { updatedAt: "desc" }],
        include: { activities: { orderBy: { createdAt: "desc" }, take: 10 } },
        take: 500,
      })
      .catch(() => []),
    includeSuggestions ? suggestLeads({ take: 20 }).catch(() => []) : Promise.resolve([]),
  ]);

  return NextResponse.json({ data: leads, suggestions });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { workspaceId } = await getRequiredWorkspace(session).catch(() => ({ workspaceId: null as any }));
  if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const b = body as Record<string, unknown>;
  const domain = asString(b.domain);
  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });

  const storeId = asString(b.storeId);
  const sourceId = asString(b.sourceId);
  const companyName = asString(b.companyName);
  const contactEmail = asString(b.contactEmail);
  const contactFormUrl = asString(b.contactFormUrl);
  const instagramUrl = asString(b.instagramUrl);
  const tiktokUrl = asString(b.tiktokUrl);
  const owner = asString(b.owner);
  const notes = asString(b.notes);
  const tags = asStringArray(b.tags) ?? [];
  const leadStage = asString(b.leadStage) ?? "NEW";

  const estimatedPotentialScoreRaw = b.estimatedPotentialScore != null ? Number(b.estimatedPotentialScore) : 0;
  const estimatedPotentialScore = Number.isFinite(estimatedPotentialScoreRaw)
    ? Math.max(0, Math.min(100, Math.round(estimatedPotentialScoreRaw)))
    : 0;

  const created = await prisma.lead
    .create({
      data: {
        workspaceId,
        domain,
        companyName,
        storeId,
        sourceId,
        contactEmail,
        contactFormUrl,
        instagramUrl,
        tiktokUrl,
        owner,
        notes,
        tags,
        leadStage: leadStage as any,
        estimatedPotentialScore,
      },
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "Create failed";
      throw new Error(msg);
    });

  void trackProductEventFromSession(session, {
    eventType: ProductEventType.LEAD_CREATE,
    path: "/api/leads",
    entityType: "LEAD",
    entityId: created.id,
    metadata: { domain },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}

