import { NextResponse } from "next/server";
import { ProductEventType } from "@/lib/analytics/product-event-types";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getStripe, stripeEnabled } from "@/lib/billing/stripe";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 400 });
  }
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured." }, { status: 400 });

  const email = session.user.email;
  const user = await prisma.user.findUnique({ where: { email } }).catch(() => null);
  if (!user?.stripeCustomerId) return NextResponse.json({ error: "No Stripe customer on file." }, { status: 400 });

  const origin = new URL(req.url).origin;
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${origin}/settings/billing`,
  });

  void trackProductEventFromSession(session, {
    eventType: ProductEventType.BILLING_PORTAL_OPEN,
    path: "/api/billing/portal",
  });

  return NextResponse.json({ ok: true, redirectUrl: portal.url });
}

