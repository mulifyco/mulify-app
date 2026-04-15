import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sourceDb } from "@/lib/prisma-source-delegate";
import { SourceRepository } from "@/server/repositories/source.repository";
import type { SourceType as PrismaSourceType } from "@prisma/client";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const candidate = await (prisma as any).discoveryCandidate.findUnique({
    where: { id },
  });
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (candidate.isPromoted) {
    return NextResponse.json({ ok: true, promoted: true, note: "already_promoted" });
  }

  const domain = candidate.domain;
  const existing = (await sourceDb().findFirst({
    where: { type: "SHOPIFY_DOMAIN" as PrismaSourceType, domain } as any,
    select: { id: true },
  })) as { id: string } | null;

  let createdSourceId: string | null = null;
  if (!existing) {
    const source = await SourceRepository.create({
      name: `Discovered: ${domain}`,
      type: "SHOPIFY_DOMAIN",
      domain,
      config: {
        sourceDomain: domain,
        discoveredFromCandidateId: candidate.id,
        discoveredFromSourceId: candidate.discoveredFromSourceId,
        discoveryReason: candidate.discoveryReason,
        discoveryScore: candidate.discoveryScore,
        promotedAt: new Date().toISOString(),
      },
    });
    createdSourceId = source.id;
  } else {
    createdSourceId = existing.id;
  }

  await (prisma as any).discoveryCandidate.update({
    where: { id: candidate.id },
    data: { isPromoted: true, promotedAt: new Date() },
  });

  return NextResponse.json({ ok: true, promoted: true, sourceId: createdSourceId });
}

