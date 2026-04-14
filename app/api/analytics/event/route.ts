import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { ProductEventType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isProductEventType, type ProductEventTypeValue } from "@/lib/analytics/product-event-types";
import { prisma } from "@/lib/prisma";
import { trackProductEvent } from "@/server/services/product-analytics.service";

export const dynamic = "force-dynamic";

/** Unauthenticated beacons (marketing / conversion funnel). */
const PUBLIC_EVENT_TYPES = new Set<ProductEventTypeValue>([
  "LANDING_VIEW",
  "CTA_CLICK",
  "PRICING_CTA_CLICK",
  "SIGNUP_START",
  "TRIAL_START",
]);

const serverThrottle = new Map<string, number>();
const SERVER_THROTTLE_MS = 12_000;

function bucketKey(
  userKey: string,
  eventType: string,
  dedupeKey: string,
  path: string | undefined,
): string {
  const slot = Math.floor(Date.now() / SERVER_THROTTLE_MS);
  return `${slot}:${userKey}:${eventType}:${dedupeKey}:${path ?? ""}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { id?: string } | undefined;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventTypeRaw = typeof body.eventType === "string" ? body.eventType.trim() : "";
  if (!isProductEventType(eventTypeRaw)) {
    return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
  }

  if (!session?.user && !PUBLIC_EVENT_TYPES.has(eventTypeRaw as ProductEventTypeValue)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userKey = user?.id && user.id.length > 0 ? user.id : "anon";

  const path = typeof body.path === "string" ? body.path.slice(0, 512) : undefined;
  const entityType = typeof body.entityType === "string" ? body.entityType.slice(0, 120) : undefined;
  const entityId = typeof body.entityId === "string" ? body.entityId.slice(0, 120) : undefined;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 120) : undefined;
  const dedupeKey = typeof body.dedupeKey === "string" ? body.dedupeKey.slice(0, 200) : "";
  const metadata =
    body.metadata && typeof body.metadata === "object" && body.metadata !== null
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  const throttleKey = bucketKey(userKey, eventTypeRaw, dedupeKey, path);
  const now = Date.now();
  const prev = serverThrottle.get(throttleKey);
  if (prev != null && now - prev < SERVER_THROTTLE_MS) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  serverThrottle.set(throttleKey, now);
  if (serverThrottle.size > 50_000) {
    serverThrottle.clear();
  }

  let workspaceId: string | null = null;
  if (user?.id) {
    const row = await prisma.user
      .findUnique({ where: { id: user.id }, select: { activeWorkspaceId: true } })
      .catch(() => null);
    workspaceId = row?.activeWorkspaceId ?? null;
  }

  await trackProductEvent({
    eventType: eventTypeRaw as ProductEventType,
    userId: user?.id ?? null,
    workspaceId,
    sessionId: sessionId ?? null,
    path: path ?? null,
    entityType: entityType ?? null,
    entityId: entityId ?? null,
    metadata: (metadata as Prisma.InputJsonValue) ?? null,
  });

  return NextResponse.json({ ok: true });
}
