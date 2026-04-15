import { NextResponse } from "next/server";
import { ProductEventType } from "@/lib/analytics/product-event-types";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getStripe, priceIdForPlan, stripeEnabled, type StripePlan } from "@/lib/billing/stripe";
import { trackProductEventFromSession } from "@/server/services/product-analytics.service";

export const dynamic = "force-dynamic";

function asPlan(v: unknown): StripePlan | null {
  const s = typeof v === "string" ? v.toUpperCase().trim() : "";
  if (s === "FREE" || s === "PRO" || s === "TEAM") return s;
  return null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const b = body as { plan?: unknown };
  const plan = asPlan(b.plan);
  if (!plan) return NextResponse.json({ error: "plan is required (FREE/PRO/TEAM)" }, { status: 400 });

  const priceId = priceIdForPlan(plan);
  if (!priceId) return NextResponse.json({ error: "Missing STRIPE_PRICE_* for plan" }, { status: 400 });

  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Stripe is not configured." }, { status: 400 });

  const email = session.user.email;
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, credits: 3, billingPlan: "FREE" },
    update: {},
  });

  let customerId = user.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  const origin = new URL(req.url).origin;
  const successUrl = `${origin}/settings/billing?success=1`;
  const cancelUrl = `${origin}/pricing?canceled=1`;

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: { userId: user.id, plan },
    },
    metadata: { userId: user.id, plan },
  });

  void trackProductEventFromSession(session, {
    eventType: ProductEventType.BILLING_CHECKOUT_START,
    path: "/api/billing/checkout",
    metadata: { plan },
  });

  return NextResponse.json({ ok: true, redirectUrl: checkout.url });
}

