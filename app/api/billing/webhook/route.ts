import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getStripe, planForPriceId } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

function asUnixSecondsToDate(sec: unknown): Date | null {
  const n = typeof sec === "number" ? sec : sec != null ? Number(sec) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 400 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid signature" }, { status: 400 });
  }

  const type = String(event.type ?? "");
  const obj = event.data?.object ?? null;

  async function applySubscription(sub: any) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    const subId = typeof sub.id === "string" ? sub.id : null;
    const status = typeof sub.status === "string" ? sub.status : null;
    const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
    const currentPeriodEnd = asUnixSecondsToDate(sub.current_period_end);

    const priceId =
      sub.items?.data?.[0]?.price?.id && typeof sub.items.data[0].price.id === "string" ? sub.items.data[0].price.id : null;
    const plan = priceId ? planForPriceId(priceId) : null;

    const user = customerId
      ? await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } }).catch(() => null)
      : null;
    if (!user) return;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeSubscriptionId: subId,
        subscriptionStatus: status,
        cancelAtPeriodEnd,
        currentPeriodEnd: currentPeriodEnd ?? undefined,
        ...(plan ? { billingPlan: plan } : {}),
      },
    });
  }

  async function applyCheckoutCompleted(sess: any) {
    const customerId = typeof sess.customer === "string" ? sess.customer : null;
    const subId = typeof sess.subscription === "string" ? sess.subscription : null;
    if (!customerId) return;
    const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } }).catch(() => null);
    if (!user) return;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeSubscriptionId: subId ?? undefined },
    });
  }

  try {
    if (type === "checkout.session.completed") {
      await applyCheckoutCompleted(obj);
    } else if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
      await applySubscription(obj);
    } else if (type === "customer.subscription.deleted") {
      await applySubscription(obj);
      // Optional: downgrade when deleted (best-effort)
      const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
      const user = customerId
        ? await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } }).catch(() => null)
        : null;
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { billingPlan: "FREE", stripeSubscriptionId: null, subscriptionStatus: "canceled" },
        });
      }
    }
  } catch {
    // webhook best-effort: still return 200 to avoid retry storms in dev
  }

  return NextResponse.json({ received: true });
}

