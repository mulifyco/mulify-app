import type { LaunchProofStats } from "@/lib/launch/proof-stats";
import BoardPreviewSection from "@/components/internal/BoardPreviewSection";
import LandingShell from "@/components/launch/LandingShell";
import { LandingCta } from "@/components/launch/LandingCta";
import Link from "next/link";
import PremiumNavbar from "@/components/launch/PremiumNavbar";
import PremiumHero from "@/components/launch/PremiumHero";

function nf(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

const SALES_MAIL =
  typeof process.env.NEXT_PUBLIC_SALES_EMAIL === "string" && process.env.NEXT_PUBLIC_SALES_EMAIL.includes("@")
    ? process.env.NEXT_PUBLIC_SALES_EMAIL.trim()
    : "hello@mulify.co";

const FAQ = [
  {
    q: "Is Mulify a Meta Ad Library replacement?",
    a: "Mulify sits on top of your sources and product graph: boards, compare, watchlists, CRM leads, and AI copilots — not just search.",
  },
  {
    q: "Can my team share one workspace?",
    a: "Team plans include seats, billing, and shared intelligence workflows. Book a demo and your admin will set up workspace access.",
  },
  {
    q: "Do you store billing cards securely?",
    a: "Payments run through Stripe. We do not store card numbers on our servers.",
  },
  {
    q: "How fresh is the data?",
    a: "Boards refresh on a daily cadence. Ingestion sources run continuously — freshness badges show last sync time on every entity.",
  },
];

const USE_CASES = [
  {
    icon: "↗",
    title: "Breakout detection",
    desc: "Spot Ready to Scale and Early Mover signals before products saturate — board scoring auto-ranks by momentum delta.",
  },
  {
    icon: "⇄",
    title: "Competitor compare",
    desc: "Compare storefronts, cluster exposure, and ad frequency side-by-side in one shareable view.",
  },
  {
    icon: "⌖",
    title: "Watchlist spikes",
    desc: "Watchlists + velocity alerts surface spikes across domains you care about, the moment they happen.",
  },
  {
    icon: "◈",
    title: "Hook intelligence",
    desc: "Creative clusters ranked by cross-store repetition. Know which angles are winning before your competitors do.",
  },
  {
    icon: "▦",
    title: "Executive summaries",
    desc: "Board contribution heatmaps, top items, delta narratives — shareable without a slide deck.",
  },
  {
    icon: "⟐",
    title: "CRM pipeline",
    desc: "Push winning stores into a kanban pipeline. Tag stages, attach notes, track demo velocity — no spreadsheet.",
  },
];

const CRM_STAGES = [
  { key: "NEW", color: "text-muted-2 border-border bg-surface-2/50", dot: "bg-muted-2" },
  { key: "RESEARCHING", color: "text-blue-300 border-blue-500/30 bg-blue-500/10", dot: "bg-blue-400" },
  { key: "CONTACTED", color: "text-indigo-300 border-indigo-500/30 bg-indigo-500/10", dot: "bg-indigo-400" },
  { key: "FOLLOW_UP", color: "text-amber-300 border-amber-500/30 bg-amber-500/10", dot: "bg-amber-400" },
  { key: "WON", color: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10", dot: "bg-emerald-400" },
];

const CRM_LEADS = [
  { store: "trendwear.co", stage: "FOLLOW_UP", mrr: "$4.2k", score: 91 },
  { store: "novafit.com", stage: "CONTACTED", mrr: "$2.8k", score: 84 },
  { store: "lumegoods.io", stage: "RESEARCHING", mrr: "$1.9k", score: 76 },
];

const COPILOT_CARDS = [
  {
    icon: "⚡",
    title: "Opportunity copilot",
    desc: "Breakout vs watch risk framing on clusters and stores.",
    badge: "AI",
    color: "border-indigo-500/25 bg-indigo-500/8",
  },
  {
    icon: "✦",
    title: "Campaign brief",
    desc: "Angles, hooks, and test ideas tied to winning signals.",
    badge: "AI",
    color: "border-purple-500/25 bg-purple-500/8",
  },
  {
    icon: "◎",
    title: "Offer analyzer",
    desc: "Landing and offer strength scoring for faster creative iteration.",
    badge: "AI",
    color: "border-blue-500/25 bg-blue-500/8",
  },
  {
    icon: "◈",
    title: "Persona analyzer",
    desc: "Audience hypotheses for messaging and channel bets.",
    badge: "AI",
    color: "border-emerald-500/25 bg-emerald-500/8",
  },
];

const HOOK_SIGNALS = [
  { hook: "Pain-point opener", stores: 38, delta: "+14%", tone: "text-emerald-300" },
  { hook: "Social proof lede", stores: 31, delta: "+9%", tone: "text-emerald-300" },
  { hook: "Scarcity + urgency", stores: 27, delta: "+6%", tone: "text-amber-300" },
  { hook: "Before / after frame", stores: 22, delta: "+4%", tone: "text-amber-300" },
  { hook: "Founder story", stores: 18, delta: "−2%", tone: "text-muted-2" },
];

const TOP_WINNING_PRODUCTS = [
  { name: "Ergonomic Neck Support", cluster: "Ready to Scale", score: 94, delta: "+12" },
  { name: "UV Shield Sunscreen SPF 80", cluster: "Early Movers", score: 88, delta: "+8" },
  { name: "Portable Cold Brew Kit", cluster: "Creative Winners", score: 82, delta: "+6" },
  { name: "Deep Sleep Weighted Eye Mask", cluster: "Market Leaders", score: 79, delta: "+5" },
];

export default function MarketingHome({ stats }: { stats: LaunchProofStats }) {
  return (
    <LandingShell>
      <PremiumNavbar />

      <main>
        {/* Hero */}
        <PremiumHero />

        {/* Live proof stats strip */}
        <section className="border-b border-border bg-surface-2/20">
          <div className="mx-auto max-w-6xl px-4 py-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Stores tracked", value: nf(stats.shopCount), sub: "Shop graph in this environment" },
              { label: "Creatives analyzed", value: nf(stats.adCount), sub: "Ads in library scope" },
              { label: "Product clusters", value: nf(stats.productClusterCount), sub: "Board-ready narratives" },
              { label: "Snapshots / 24h", value: nf(stats.snapshotRowsLast24h), sub: "Historical board deltas" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-border bg-card/60 glass p-4 premium-ring"
              >
                <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em]">{s.label}</div>
                <div className="text-2xl font-bold tabular-nums mt-1.5 text-foreground">{s.value}</div>
                <p className="text-[11px] text-muted mt-1">{s.sub}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-muted pb-8 px-4">
            Teams use Mulify to compress research → decision → outreach — with audit-friendly exports.
          </p>
        </section>

        {/* Use cases */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.22em]">Use cases</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mt-4">
            Six workflows growth teams run weekly
          </h2>
          <p className="text-sm text-muted mt-2 max-w-2xl">
            Each surface wired to live data — no manual refresh, no spreadsheet wrangling.
          </p>
          <ul className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {USE_CASES.map((uc, i) => (
              <li
                key={i}
                className="group rounded-2xl border border-border bg-card/55 glass premium-ring p-5 hover:border-indigo-500/30 transition-colors"
              >
                <div className="h-9 w-9 rounded-xl border border-border bg-surface-2/60 glass flex items-center justify-center text-sm text-indigo-300 mb-3 group-hover:bg-indigo-500/10 group-hover:border-indigo-500/30 transition-colors">
                  {uc.icon}
                </div>
                <div className="text-sm font-semibold text-foreground">{uc.title}</div>
                <p className="text-xs text-muted mt-2 leading-relaxed">{uc.desc}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Board previews */}
        <section className="border-y border-border bg-surface-2/15 py-16">
          <div className="mx-auto max-w-6xl px-4 space-y-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Board previews</h2>
              <p className="text-sm text-muted mt-2 max-w-2xl">
                Same board components you will use after sign-in — tuned for premium intelligence reporting.
              </p>
            </div>
            <BoardPreviewSection
              title="Ready to Scale (preview)"
              description="High-upside product clusters your team can brief creatives on."
              viewAllHref="/login"
            >
              <div className="divide-y divide-border">
                {TOP_WINNING_PRODUCTS.map((p) => (
                  <div key={p.name} className="flex items-center justify-between px-4 py-3 hover:bg-surface-2/30 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{p.name}</div>
                      <div className="text-[11px] text-muted mt-0.5">{p.cluster}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                        {p.delta}
                      </span>
                      <span className="text-sm font-semibold text-foreground tabular-nums w-8 text-right">{p.score}</span>
                    </div>
                  </div>
                ))}
                <div className="px-4 py-3 text-xs text-muted">
                  Sign in → <span className="text-foreground font-medium">Boards → Ready to Scale</span> for live rows, deltas, and explainability.
                </div>
              </div>
            </BoardPreviewSection>
            <BoardPreviewSection
              title="Creative Winners (preview)"
              description="Durable creative clusters with cross-store repetition."
              viewAllHref="/demo"
            >
              <div className="px-4 py-6 space-y-3">
                <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em]">Top hooks by store count</div>
                {HOOK_SIGNALS.slice(0, 3).map((h) => (
                  <div key={h.hook} className="flex items-center gap-3">
                    <div className="text-sm text-foreground flex-1">{h.hook}</div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden border border-border">
                        <div className="h-full bg-indigo-500/60 rounded-full" style={{ width: `${(h.stores / 40) * 100}%` }} />
                      </div>
                      <span className={`text-[11px] font-semibold tabular-nums ${h.tone}`}>{h.delta}</span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted pt-2">
                  Pro unlocks the full Creative Winners board — see the live demo for a static snapshot.
                </p>
              </div>
            </BoardPreviewSection>
          </div>
        </section>

        {/* CRM pipeline preview */}
        <section className="mx-auto max-w-6xl px-4 py-16 grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/25 bg-indigo-500/8 px-3 py-1 mb-4">
              <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-[0.18em]">CRM + Lead workflow</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              From board signal to closed deal
            </h2>
            <p className="text-sm text-muted mt-3 leading-relaxed max-w-md">
              Push winning stores into a kanban-style pipeline. Tag stages, attach notes, and keep sales aligned with what intelligence surfaced.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "One-click lead from compare, boards, or watchlists",
                "Revenue estimate + demo velocity tracking",
                "Stage glow + overdue follow-up chips",
                "Pipeline MRR snapshot at a glance",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-foreground">
                  <span className="mt-0.5 h-4 w-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[10px] text-emerald-300 shrink-0">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Live CRM pipeline mock */}
          <div className="rounded-2xl border border-border bg-card/55 glass premium-ring overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2">Pipeline preview</div>
                <div className="text-sm font-semibold text-foreground">GTM Leads · Q2 2026</div>
              </div>
              <span className="text-[11px] font-semibold text-emerald-200 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                3 active
              </span>
            </div>

            {/* Stage pills */}
            <div className="px-5 pt-4 flex flex-wrap gap-2">
              {CRM_STAGES.map((s) => (
                <span key={s.key} className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${s.color} flex items-center gap-1.5`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  {s.key}
                </span>
              ))}
            </div>

            {/* Lead rows */}
            <div className="mt-4 divide-y divide-border">
              {CRM_LEADS.map((l) => {
                const stageStyle = CRM_STAGES.find((s) => s.key === l.stage);
                return (
                  <div key={l.store} className="flex items-center justify-between px-5 py-3 hover:bg-surface-2/30 transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{l.store}</div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${stageStyle?.color ?? "text-muted border-border bg-surface-2/40"} inline-flex items-center gap-1 mt-0.5`}>
                        <span className={`h-1 w-1 rounded-full ${stageStyle?.dot ?? "bg-muted"}`} />
                        {l.stage}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-[11px] text-muted">Est. MRR</div>
                        <div className="text-sm font-semibold text-foreground">{l.mrr}</div>
                      </div>
                      <div className="h-8 w-8 rounded-full border border-border bg-surface-2/60 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                        {l.score}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-border">
              <div className="text-xs text-muted">
                Sign in and use <span className="text-foreground font-medium">&quot;Load sample workspace&quot;</span> to seed demo leads.
              </div>
            </div>
          </div>
        </section>

        {/* AI copilot */}
        <section className="border-y border-border bg-gradient-to-b from-indigo-500/5 to-transparent py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/25 bg-purple-500/8 px-3 py-1 mb-4">
              <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-[0.18em]">AI copilot suite</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Grounded in your data, not generic chat
            </h2>
            <p className="text-sm text-muted mt-2 max-w-2xl">
              Copilot, creative brief, offer analyzer, and persona analyzer — each tied to your entities, live board scores, and watchlist spikes.
            </p>
            <div className="mt-8 grid sm:grid-cols-2 gap-4">
              {COPILOT_CARDS.map((c) => (
                <div key={c.title} className={`rounded-2xl border premium-ring p-5 ${c.color}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="h-9 w-9 rounded-xl border border-border bg-surface-2/60 glass flex items-center justify-center text-base">
                      {c.icon}
                    </div>
                    <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {c.badge}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-foreground mt-3">{c.title}</div>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Hook intelligence */}
        <section className="mx-auto max-w-6xl px-4 py-16 grid lg:grid-cols-2 gap-12 items-start">
          <div className="rounded-2xl border border-border bg-card/55 glass premium-ring overflow-hidden order-2 lg:order-1">
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2">Hook intelligence</div>
              <div className="text-sm font-semibold text-foreground mt-0.5">Creative signal ranking · last 30d</div>
            </div>
            <div className="divide-y divide-border">
              {HOOK_SIGNALS.map((h, i) => (
                <div key={h.hook} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-2/25 transition-colors">
                  <div className="w-5 text-center text-[11px] font-bold text-muted-2 shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground">{h.hook}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="h-1 flex-1 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                          style={{ width: `${(h.stores / 40) * 100}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-muted shrink-0">{h.stores} stores</span>
                    </div>
                  </div>
                  <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${h.tone}`}>{h.delta}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/8 px-3 py-1 mb-4">
              <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-[0.18em]">Hook intelligence</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Know which angles are winning
            </h2>
            <p className="text-sm text-muted mt-3 leading-relaxed max-w-md">
              Creative hooks ranked by cross-store repetition and delta velocity. Surface the winning frame before your competitors do.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Ranked by store-count momentum, not vanity metrics",
                "Delta badges show 30-day velocity change",
                "Exportable hook list for creative briefs",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-foreground">
                  <span className="mt-0.5 h-4 w-4 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[10px] text-amber-300 shrink-0">◈</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Reports — data-first, NO PDF preview placeholder */}
        <section className="border-y border-border bg-surface-2/10 py-16">
          <div className="mx-auto max-w-6xl px-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/45 glass px-3 py-1 mb-4">
              <span className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em]">Executive reports</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Board intelligence, not blank slides
            </h2>
            <p className="text-sm text-muted mt-2 max-w-2xl mb-8">
              Reports are executive narrative cards built from live board data — top items, delta trends, heatmaps. Export as CSV or JSON on eligible plans.
            </p>

            {/* Executive narrative cards grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Top board mover", value: "Ergonomic Neck", delta: "+12 pts", tone: "emerald" },
                { label: "Creative bursts", value: "3 clusters", delta: "+2 new", tone: "purple" },
                { label: "Watchlist spikes", value: "5 alerts", delta: "last 24h", tone: "amber" },
                { label: "Pipeline MRR", value: "$14.8k", delta: "+$3.2k", tone: "indigo" },
              ].map((c) => (
                <div
                  key={c.label}
                  className={`rounded-2xl border bg-card/60 glass premium-ring p-4 ${
                    c.tone === "emerald" ? "border-emerald-500/20" :
                    c.tone === "purple" ? "border-purple-500/20" :
                    c.tone === "amber" ? "border-amber-500/20" :
                    "border-indigo-500/20"
                  }`}
                >
                  <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em]">{c.label}</div>
                  <div className="text-xl font-semibold text-foreground mt-1.5">{c.value}</div>
                  <div className={`text-[11px] font-medium mt-1 ${
                    c.tone === "emerald" ? "text-emerald-300" :
                    c.tone === "purple" ? "text-purple-300" :
                    c.tone === "amber" ? "text-amber-300" :
                    "text-indigo-300"
                  }`}>{c.delta}</div>
                </div>
              ))}
            </div>

            {/* Board contribution heatmap */}
            <div className="rounded-2xl border border-border bg-card/55 glass premium-ring p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em]">Board contribution</div>
                  <div className="text-sm font-semibold text-foreground mt-0.5">Signal distribution · last 7d</div>
                </div>
                <div className="flex gap-2">
                  {["CSV", "JSON"].map((f) => (
                    <span key={f} className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-border bg-surface-2/60 text-muted-2 uppercase tracking-wider">
                      {f}
                    </span>
                  ))}
                  <span className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 uppercase tracking-wider">
                    PDF · Pro+
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { board: "Ready to Scale", pct: 34, color: "bg-emerald-500/70" },
                  { board: "Early Movers", pct: 26, color: "bg-indigo-500/70" },
                  { board: "Creative Winners", pct: 19, color: "bg-purple-500/70" },
                  { board: "Market Leaders", pct: 14, color: "bg-blue-500/70" },
                  { board: "Saturated", pct: 7, color: "bg-amber-500/70" },
                ].map((b) => (
                  <div key={b.board} className="text-center">
                    <div className="h-20 rounded-xl bg-surface-2/50 border border-border relative overflow-hidden">
                      <div
                        className={`absolute bottom-0 left-0 right-0 ${b.color} rounded-xl transition-all`}
                        style={{ height: `${b.pct}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-foreground tabular-nums">{b.pct}%</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-muted-2 mt-1.5 leading-tight">{b.board}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="relative border-t border-border py-16 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-80 hero-glow" />
          <div className="mx-auto max-w-6xl px-4 text-center relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/35 glass px-3 py-1.5 premium-ring mb-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-2">
                Pricing & rollout
              </span>
              <span className="text-[11px] text-muted-2">Free · Pro · Team</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Premium intelligence, built to scale with your workflow.
            </h2>
            <p className="text-sm text-muted mt-3 max-w-xl mx-auto leading-relaxed">
              Plans from Free to Team. Your admin provisions access — book a demo or sign in if you already have credentials.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LandingCta
                href="/book-demo"
                ctaId="pricing_block_book_demo_primary"
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 shadow-[0_14px_60px_rgba(109,93,246,0.30)]"
              >
                Book demo
              </LandingCta>
              <LandingCta
                href="/login"
                ctaId="pricing_block_sign_in"
                className="px-5 py-2.5 rounded-xl border border-border bg-card/35 glass text-sm font-semibold hover:bg-surface-2/60"
              >
                Sign in
              </LandingCta>
              <LandingCta
                href="/pricing"
                ctaId="pricing_block_see_plans"
                className="px-5 py-2.5 rounded-xl border border-border bg-surface-2/20 glass text-sm font-semibold hover:bg-surface-2/50"
              >
                See plans
              </LandingCta>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">FAQ</h2>
          <div className="mt-8 space-y-4 max-w-3xl">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-border bg-card/45 glass premium-ring p-5">
                <div className="text-sm font-semibold text-foreground">{item.q}</div>
                <p className="text-sm text-muted mt-2 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border bg-card/25 glass py-10">
          <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row justify-between gap-6 text-sm text-muted">
            <div>
              <div className="font-semibold text-foreground tracking-tight">Mulify</div>
              <p className="mt-2 text-xs max-w-sm leading-relaxed">
                Intelligence for growth teams — boards, CRM, and AI in one premium workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 items-start">
              <LandingCta href="/pricing" ctaId="footer_pricing" className="hover:text-foreground transition-colors">
                Pricing
              </LandingCta>
              <LandingCta href="/demo" ctaId="footer_demo" className="hover:text-foreground transition-colors">
                Demo
              </LandingCta>
              <LandingCta href="/login" ctaId="footer_login" className="hover:text-foreground transition-colors">
                Sign in
              </LandingCta>
              <span className="text-xs text-muted-2">Privacy: process only what you connect · see settings in-app.</span>
            </div>
          </div>
        </footer>
      </main>
    </LandingShell>
  );
}
