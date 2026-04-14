import Link from "next/link";
import { auth } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/access";
import { PLANS, type FeatureId } from "@/lib/billing/plans";
import Badge from "@/components/ui/Badge";
import prisma from "@/lib/prisma";
import PricingActions from "@/app/pricing/PricingActions";
import PricingHeroCtas from "@/app/pricing/PricingHeroCtas";

export const dynamic = "force-dynamic";

const SALES_MAIL =
  typeof process.env.NEXT_PUBLIC_SALES_EMAIL === "string" && process.env.NEXT_PUBLIC_SALES_EMAIL.includes("@")
    ? process.env.NEXT_PUBLIC_SALES_EMAIL.trim()
    : "hello@mulify.co";

const FEATURES: Array<{ key: FeatureId; label: string; desc: string }> = [
  { key: "BOARDS", label: "Boards", desc: "Ready to Scale, Market Leaders, Early Movers, Saturated, Creative Winners" },
  { key: "CREATIVE_WINNERS", label: "Creative Winners", desc: "Durable creative clusters with cross-store repetition" },
  { key: "COMPARE", label: "Compare", desc: "Side-by-side storefront and cluster comparison" },
  { key: "WATCHLISTS", label: "Watchlists", desc: "Domain velocity monitoring with spike alerts" },
  { key: "ALERTS", label: "Alerts", desc: "Board and watchlist alert notifications" },
  { key: "SAVED_FILTERS", label: "Saved Filters", desc: "Persist board filter combinations" },
  { key: "REPORTS", label: "Reports", desc: "Executive narrative summaries and exports" },
  { key: "PDF_EXPORT", label: "PDF export", desc: "PDF snapshot export from reports" },
  { key: "OPS", label: "Ops dashboard", desc: "Source health, stalled jobs, data freshness" },
  { key: "REVIEW_QUEUE", label: "Review queue", desc: "Manual review pipeline for AI-flagged items" },
];

const PLAN_COLORS: Record<string, { accent: string; glow: string; badge: string }> = {
  FREE: {
    accent: "border-border",
    glow: "",
    badge: "bg-surface-2/60 text-muted border-border",
  },
  PRO: {
    accent: "border-indigo-500/40",
    glow: "shadow-[0_0_0_1px_rgba(109,93,246,0.15),0_24px_80px_rgba(109,93,246,0.12)]",
    badge: "bg-indigo-500/12 text-indigo-200 border-indigo-500/30",
  },
  TEAM: {
    accent: "border-purple-500/35",
    glow: "shadow-[0_0_0_1px_rgba(139,92,246,0.12),0_24px_80px_rgba(139,92,246,0.10)]",
    badge: "bg-purple-500/12 text-purple-200 border-purple-500/30",
  },
};

function TickCell({ on }: { on: boolean }) {
  if (on) {
    return (
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500/15 border border-emerald-500/30">
        <span className="text-[10px] text-emerald-400 font-bold">✓</span>
      </span>
    );
  }
  return <span className="text-muted-2 text-sm">—</span>;
}

export default async function PricingPage() {
  const session = await auth();
  const plan = getUserPlan(session);
  const email = session?.user?.email ?? null;
  const user = email ? await prisma.user.findUnique({ where: { email } }).catch(() => null) : null;
  const currentPlan = (
    user?.billingPlan === "FREE" || user?.billingPlan === "PRO" || user?.billingPlan === "TEAM"
      ? user.billingPlan
      : plan
  ) as "FREE" | "PRO" | "TEAM";

  const order = [PLANS.FREE, PLANS.PRO, PLANS.TEAM];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/60 glass premium-ring p-6 sm:p-8">
        <div className="absolute inset-0 pointer-events-none hero-glow opacity-40" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.22em] mb-1">Pricing & plans</div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Premium intelligence, built to scale
              </h1>
              <p className="text-sm text-muted mt-2 max-w-xl leading-relaxed">
                Stripe-backed plans. Upgrade, downgrade, cancel, or manage billing from the portal.
              </p>
            </div>
            <div className="flex items-center gap-2.5 text-sm shrink-0">
              <Link href="/" className="text-muted hover:text-foreground transition-colors">Home</Link>
              <span className="text-border">·</span>
              <Link href="/dashboard" className="text-muted hover:text-foreground transition-colors">← App</Link>
              <span className="text-border">·</span>
              <Link href="/settings/billing" className="text-muted hover:text-foreground transition-colors">Billing →</Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              "Secure billing via Stripe",
              "Cancel anytime",
              "Daily board refresh cadence",
              "Source reliability in Ops",
              "You control connected sources",
            ].map((t) => (
              <span key={t} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-surface-2/50 glass text-muted">
                {t}
              </span>
            ))}
          </div>

          <div className="mt-5">
            <PricingHeroCtas loggedIn={Boolean(email)} salesEmail={SALES_MAIL} />
          </div>
        </div>
      </div>

      {/* Current plan status */}
      <div className="rounded-2xl border border-border bg-card/55 glass premium-ring p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-muted">
          <span className="font-semibold text-foreground">Current plan:</span>{" "}
          <span className="text-foreground font-medium">{user?.billingPlan ?? plan}</span>
          {user?.subscriptionStatus ? (
            <span className="text-xs text-muted-2 ml-2">
              · {user.subscriptionStatus}
              {user.cancelAtPeriodEnd ? " (cancels at period end)" : ""}
            </span>
          ) : null}
        </div>
        <PricingActions currentPlan={currentPlan} />
      </div>

      {/* Plan cards */}
      <div id="plans" className="grid grid-cols-1 lg:grid-cols-3 gap-5 scroll-mt-24">
        {order.map((p) => {
          const pc = PLAN_COLORS[p.id] ?? PLAN_COLORS.FREE;
          const isCurrent = p.id === currentPlan;
          return (
            <div
              key={p.id}
              className={`rounded-2xl border bg-card/60 glass p-5 relative overflow-hidden transition-all ${pc.accent} ${pc.glow} ${
                isCurrent ? "ring-1 ring-indigo-500/30" : ""
              }`}
            >
              {isCurrent ? (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500/60 via-purple-500/60 to-transparent" />
              ) : null}

              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-lg font-semibold text-foreground">{p.label}</div>
                  <div className="text-xs text-muted mt-0.5">{p.tagline}</div>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider ${pc.badge}`}>
                  {isCurrent ? "Current" : p.id}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
                  <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.15em]">Monthly credits</div>
                  <div className="text-xl font-bold tabular-nums mt-1 text-foreground">{p.monthlyCredits}</div>
                </div>
                <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
                  <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.15em]">Reports / mo</div>
                  <div className="text-xl font-bold tabular-nums mt-1 text-foreground">{p.limits.maxReportsPerMonth}</div>
                </div>
              </div>

              <PricingActions currentPlan={currentPlan} targetPlan={p.id} />

              {p.id === "TEAM" ? (
                <p className="mt-3 text-[11px] text-muted leading-relaxed">
                  Need procurement, SSO, or higher limits?{" "}
                  <Link className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors" href="/book-demo">
                    Book a Team demo →
                  </Link>
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Feature table */}
      <div className="rounded-2xl border border-border bg-card/55 glass premium-ring overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.22em]">Feature comparison</div>
          <div className="text-sm font-semibold text-foreground mt-0.5">All features by plan</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border/60 bg-surface-2/30">
                <th className="px-5 py-3 text-left text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em]">Feature</th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em]">Free</th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold text-indigo-300 uppercase tracking-[0.18em]">Pro</th>
                <th className="px-4 py-3 text-center text-[10px] font-semibold text-purple-300 uppercase tracking-[0.18em]">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {FEATURES.map((f) => (
                <tr key={f.key} className="hover:bg-surface-2/25 transition-colors group">
                  <td className="px-5 py-3">
                    <div className="font-medium text-foreground">{f.label}</div>
                    <div className="text-[11px] text-muted mt-0.5 hidden group-hover:block">{f.desc}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TickCell on={PLANS.FREE.features[f.key]} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TickCell on={PLANS.PRO.features[f.key]} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TickCell on={PLANS.TEAM.features[f.key]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
