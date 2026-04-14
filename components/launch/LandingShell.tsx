"use client";

import { useEffect } from "react";
import Link from "next/link";
import { trackPublicProductEvent } from "@/lib/analytics/track-public-product-event";

export default function LandingShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    trackPublicProductEvent("LANDING_VIEW", { dedupeKey: "home", path: "/" });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {children}
      <div className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/35 glass px-4 py-3 md:py-3.5 premium-ring">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <p className="text-xs text-muted sm:max-w-md">
            <span className="font-semibold text-foreground">Mulify</span> — Minea-style intelligence, CRM-ready
            leads, and AI copilots in one workspace.
          </p>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/demo"
              onClick={() =>
                trackPublicProductEvent("CTA_CLICK", {
                  dedupeKey: "sticky_try_demo",
                  metadata: { ctaId: "sticky_try_live_demo", surface: "sticky_bar" },
                })
              }
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-border bg-surface-2/30 glass hover:bg-surface-2/60 text-center"
            >
              Try live demo
            </Link>
            <Link
              href="/book-demo"
              onClick={() =>
                trackPublicProductEvent("CTA_CLICK", {
                  dedupeKey: "sticky_book_demo",
                  metadata: { ctaId: "sticky_book_demo", surface: "sticky_bar" },
                })
              }
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-center shadow-[0_14px_50px_rgba(109,93,246,0.28)]"
            >
              Book demo
            </Link>
          </div>
        </div>
      </div>
      <div className="h-24" aria-hidden />
    </div>
  );
}
