"use client";

import Link from "next/link";
import { trackPricingCtaClick } from "@/lib/analytics/pricing-track";

export default function PricingHeroCtas({
  loggedIn,
  salesEmail: _salesEmail,
}: {
  loggedIn: boolean;
  /** Kept for API compatibility; demo booking uses /book-demo. */
  salesEmail: string;
}) {
  void _salesEmail;

  return (
    <div className="rounded-2xl border border-border bg-card/55 glass premium-ring p-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
      <span className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em] shrink-0">Get access</span>
      <div className="flex flex-wrap gap-2">
        <Link
          href={loggedIn ? "/dashboard" : "/book-demo"}
          onClick={() => trackPricingCtaClick(loggedIn ? "hero_go_to_dashboard" : "hero_book_demo")}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 shadow-[0_8px_24px_rgba(112,96,248,0.22)] transition-opacity"
        >
          {loggedIn ? "Go to dashboard" : "Book demo"}
        </Link>
        <Link
          href="/pricing#plans"
          onClick={() => trackPricingCtaClick("hero_see_plans")}
          className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-surface-2/60 transition-colors"
        >
          See plans
        </Link>
        {!loggedIn && (
          <Link
            href="/login"
            onClick={() => trackPricingCtaClick("hero_sign_in")}
            className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted hover:text-foreground hover:bg-surface-2/40 transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
