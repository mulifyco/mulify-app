import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import QueryErrorState from "@/components/internal/QueryErrorState";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { stripeEnabled } from "@/lib/billing/stripe";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return (
      <div className="space-y-4">
        <PageHeader title="Billing" description="Subscription and plan state" />
        <QueryErrorState
          title="Sign in required"
          message="Please sign in to view billing and subscription status."
          action={
            <a className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline" href="/login">
              Go to login →
            </a>
          }
        />
      </div>
    );
  }

  const u = await prisma.user.findUnique({ where: { email } }).catch(() => null);

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Billing"
        description="Stripe-backed subscription status and plan controls"
        action={
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm text-muted hover:opacity-80">
              View pricing →
            </Link>
          </div>
        }
      />

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[11px] text-muted uppercase">Current plan</div>
            <div className="text-lg font-semibold text-foreground">{u?.billingPlan ?? "FREE"}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted uppercase">Subscription status</div>
            <div className="text-sm text-foreground">{u?.subscriptionStatus ?? "—"}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted uppercase">Period end</div>
            <div className="text-sm text-foreground">
              {u?.currentPeriodEnd ? new Date(u.currentPeriodEnd).toLocaleString() : "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted uppercase">Cancel at period end</div>
            <div className="text-sm text-foreground">{u?.cancelAtPeriodEnd ? "Yes" : "No"}</div>
          </div>
        </div>

        <BillingClient stripeConfigured={stripeEnabled()} />
      </div>
    </div>
  );
}

