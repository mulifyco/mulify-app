"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { LandingCta } from "@/components/launch/LandingCta";

export default function PremiumNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/35 glass">
      <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-[var(--hero-gradient)] text-[var(--primary-foreground)] flex items-center justify-center font-semibold text-xs premium-ring">
            M
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-foreground truncate">Mulify</div>
            <div className="text-[11px] text-muted-2 truncate">Live intelligence OS</div>
          </div>
        </Link>

        <nav className="hidden sm:flex items-center gap-2 text-xs font-semibold">
          <LandingCta href="/pricing" ctaId="nav_pricing" className="px-3 py-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-2/60 transition-colors">
            Pricing
          </LandingCta>
          <LandingCta href="/demo" ctaId="nav_try_demo" className="px-3 py-2 rounded-lg text-muted hover:text-foreground hover:bg-surface-2/60 transition-colors">
            Try live demo
          </LandingCta>
          <LandingCta
            href="/book-demo"
            ctaId="nav_book_demo"
            className="px-3 py-2 rounded-lg border border-border bg-surface-2/50 hover:bg-surface-2/70 transition-colors text-foreground"
          >
            Book demo
          </LandingCta>
          <LandingCta
            href="/login"
            ctaId="nav_sign_in"
            className="px-3 py-2 rounded-lg border border-border bg-surface-2/50 hover:bg-surface-2/70 transition-colors text-foreground"
          >
            Sign in
          </LandingCta>
          <LandingCta
            href="/book-demo"
            ctaId="nav_book_demo_primary"
            className="px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-[0_10px_30px_rgba(109,93,246,0.25)]"
          >
            Book demo
          </LandingCta>
        </nav>

        <div className="sm:hidden flex items-center gap-2">
          <LandingCta
            href="/login"
            ctaId="nav_sign_in_mobile"
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
          >
            Sign in
          </LandingCta>
        </div>
      </div>

      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-none h-px w-full bg-gradient-to-r from-transparent via-indigo-500/35 to-transparent"
      />
    </header>
  );
}

