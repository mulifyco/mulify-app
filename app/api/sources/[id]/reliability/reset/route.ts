import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sourceDb } from "@/lib/prisma-source-delegate";

/**
 * Clears auto-disable / cooldown and marks the source reliable again for scheduling.
 * Does not change Source.status (ACTIVE/PAUSED/…).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const updated = await sourceDb().update({
      where: { id },
      data: {
        reliabilityStatus: "HEALTHY",
        consecutiveFailures: 0,
        consecutiveEmptyRuns: 0,
        cooldownUntil: null,
        disabledReason: null,
        lastHealthyAt: new Date(),
      },
      select: { id: true, name: true, reliabilityStatus: true },
    });
    return NextResponse.json({ ok: true, source: updated });
  } catch {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }
}
