import type { Metadata } from "next";
import Link from "next/link";
import ReportSummaryCards from "@/components/internal/report/ReportSummaryCards";
import BoardPreviewSection from "@/components/internal/BoardPreviewSection";
import { LandingCta } from "@/components/launch/LandingCta";

export const metadata: Metadata = {
  title: "Live demo — Mulify",
  description: "Static preview of executive summaries and board-style reporting.",
};

const WINNER_ROWS = [
  { label: "Cluster A · hydrating serum", score: "92", stores: "38" },
  { label: "Cluster B · pet calming", score: "88", stores: "24" },
  { label: "Cluster C · portable blender", score: "85", stores: "31" },
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-4 max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-sm font-bold">
          Mulify
        </Link>
        <div className="flex gap-3 text-xs">
          <Link href="/pricing" className="text-muted hover:text-foreground">
            Pricing
          </Link>
          <LandingCta href="/login" ctaId="demo_sign_in" className="text-indigo-600 dark:text-indigo-400">
            Sign in →
          </LandingCta>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 space-y-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live demo snapshot</h1>
          <p className="text-sm text-muted mt-2 max-w-2xl leading-relaxed">
            This page is a static showcase. Sign in and load the sample workspace to see real rows wired to your
            environment.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold mb-3">Executive summary (sample)</h2>
          <ReportSummaryCards
            cards={[
              { label: "Narrative focus", value: "Beauty · Pets" },
              { label: "Top board", value: "Ready to Scale" },
              { label: "Watchlists", value: "3 active" },
              { label: "Confidence", value: "High" },
            ]}
          />
          <p className="text-xs text-muted mt-4 leading-relaxed">
            Narrative and top items populate from live reports after you run ingestion and create an executive summary.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">PDF snapshot (preview)</h2>
          <div className="rounded-xl border border-dashed border-border bg-card p-8 flex flex-col items-center">
            <div className="w-full max-w-[220px] aspect-[3/4] rounded-lg bg-surface-2 border border-border shadow-inner flex items-center justify-center text-xs text-muted text-center px-4">
              Branded PDF export (Pro+)
            </div>
          </div>
        </section>

        <section>
          <BoardPreviewSection
            title="Creative / scale winners (sample rows)"
            description="Illustrative winners — not live data."
            viewAllHref="/login"
          >
            {WINNER_ROWS.map((r) => (
              <div key={r.label} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-foreground">{r.label}</span>
                <span className="text-xs text-muted tabular-nums">
                  score {r.score} · {r.stores} stores
                </span>
              </div>
            ))}
          </BoardPreviewSection>
        </section>

        <div className="flex flex-wrap gap-3 pb-16">
          <LandingCta
            href="/login"
            ctaId="demo_footer_sign_in"
            className="px-4 py-2 rounded-xl bg-foreground text-background text-sm font-semibold"
          >
            Sign in
          </LandingCta>
          <LandingCta href="/book-demo" ctaId="demo_footer_book" className="px-4 py-2 rounded-xl border border-border text-sm font-semibold">
            Book demo
          </LandingCta>
        </div>
      </main>
    </div>
  );
}
