import { NextResponse } from "next/server";
import { ProductEventType } from "@/lib/analytics/product-event-types";
import { auth } from "@/lib/auth";
import { seedLaunchDemoForUser } from "@/server/services/launch-demo.service";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id?: string }).id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await seedLaunchDemoForUser(userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  void trackProductEventFromSession(session, {
    eventType: ProductEventType.DEMO_WORKSPACE_ENTER,
    path: "/api/launch/demo-seed",
    metadata: { already: result.already },
  });

  return NextResponse.json({ ok: true, already: result.already });
}
