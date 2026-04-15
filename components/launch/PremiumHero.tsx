"use client";

import { motion } from "framer-motion";
import { LandingCta } from "@/components/launch/LandingCta";

function FloatingSignal({
  label,
  value,
  delay,
  tone = "default",
}: {
  label: string;
  value: string;
  delay: number;
  tone?: "default" | "success" | "warning" | "indigo";
}) {
  const toneMap: Record<string, string> = {
    default: "text-foreground",
    success: "text-emerald-300",
    warning: "text-amber-300",
    indigo: "text-indigo-300",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className="rounded-2xl border border-border bg-card/65 glass premium-ring px-4 py-3"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${toneMap[tone]}`}>{value}</div>
    </motion.div>
  );
}

const LIVE_SIGNALS = [
  { label: "Fresh sources", value: "12 / 12", status: "success" as const },
  { label: "Boards refreshed", value: "24h ago", status: "default" as const },
  { label: "Creative bursts", value: "3 clusters", status: "warning" as const },
  { label: "Crossover hooks", value: "8 active", status: "default" as const },
];

const TRENDING = [
  { label: "+12 winning products", width: "72%", color: "from-indigo-500 to-purple-500" },
  { label: "3 competitor spikes", width: "48%", color: "from-amber-500 to-orange-500" },
  { label: "8 new hooks", width: "60%", color: "from-emerald-500 to-teal-500" },
  { label: "4 leads qualified", width: "36%", color: "from-blue-500 to-indigo-500" },
];

export default function PremiumHero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-indigo-600/14 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24 relative">
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Left — copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/45 glass px-3 py-1.5 premium-ring mb-5"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_0_4px_rgba(34,197,94,0.16)]" />
              </span>
              <span className="text-[11px] font-semibold tracking-[0.16em] uppercase text-foreground">
                Live intelligence
              </span>
              <span className="text-[11px] text-muted-2">boards · hooks · watchlists</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.05, ease: "easeOut" }}
              className="text-4xl sm:text-[56px] lg:text-[64px] font-semibold tracking-tight text-foreground leading-[1.04]"
            >
              Minea-grade discovery.
              <br />
              <span className="bg-[var(--hero-gradient)] bg-clip-text text-transparent">
                Executive control room
              </span>{" "}
              for growth.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12, ease: "easeOut" }}
              className="mt-5 text-base sm:text-lg text-muted max-w-xl leading-relaxed"
            >
              Mulify keeps your boards, trending feeds, and CRM pipeline fresh automatically.
              Winning hooks, storefront signals, competitor spikes — one premium workspace.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.20, ease: "easeOut" }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <LandingCta
                href="/book-demo"
                ctaId="hero_book_demo_primary"
                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 shadow-[0_14px_50px_rgba(112,96,248,0.32)]"
              >
                Book demo
              </LandingCta>
              <LandingCta
                href="/book-demo"
                ctaId="hero_book_demo_v3"
                className="px-5 py-2.5 rounded-xl border border-border bg-card/40 glass text-sm font-semibold hover:bg-surface-2/60 transition-colors"
              >
                Book demo
              </LandingCta>
              <LandingCta
                href="/login"
                ctaId="hero_sign_in"
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-foreground hover:bg-surface-2/40 border border-transparent transition-colors"
              >
                Sign in →
              </LandingCta>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.30 }}
              className="mt-7 flex flex-wrap gap-2"
            >
              {["Secure billing (Stripe)", "Cancel anytime", "Live freshness badges", "Explainability built-in"].map((t) => (
                <span key={t} className="text-[11px] px-2.5 py-1.5 rounded-full border border-border bg-card/35 glass text-muted">
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right — live dashboard collage */}
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut", delay: 0.08 }}
              className="rounded-3xl border border-border bg-card/40 glass premium-ring overflow-hidden"
            >
              {/* Header bar */}
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2">Dashboard</div>
                  <div className="text-sm font-semibold text-foreground">Executive control room</div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-[11px] font-semibold text-emerald-200">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  </span>
                  Live
                </span>
              </div>

              <div className="p-4 space-y-3">
                {/* Live metric grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  {LIVE_SIGNALS.map(({ label, value, status }) => (
                    <div key={label} className={`rounded-xl border px-3 py-2.5 ${
                      status === "success" ? "border-emerald-500/20 bg-emerald-500/6" :
                      status === "warning" ? "border-amber-500/20 bg-amber-500/6" :
                      "border-border bg-surface-2/40"
                    } glass`}>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-2">{label}</div>
                      <div className={`mt-1 text-base font-semibold tabular-nums ${
                        status === "success" ? "text-emerald-300" :
                        status === "warning" ? "text-amber-300" :
                        "text-foreground"
                      }`}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Trending signals */}
                <div className="rounded-xl border border-border bg-surface-2/30 glass p-3.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2 mb-3">
                    Live intelligence signals
                  </div>
                  <div className="space-y-2.5">
                    {TRENDING.map(({ label, width, color }) => (
                      <div key={label} className="flex items-center gap-3">
                        <div className="text-[12px] text-foreground flex-1">{label}</div>
                        <div className="h-1.5 w-24 rounded-full bg-white/6 overflow-hidden shrink-0">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width }}
                            transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
                            className={`h-full rounded-full bg-gradient-to-r ${color}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CRM velocity strip */}
                <div className="rounded-xl border border-border bg-surface-2/30 glass px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-2">CRM lead velocity</div>
                    <div className="text-sm font-semibold text-foreground mt-0.5">3 leads qualified today</div>
                  </div>
                  <div className="shrink-0 h-8 w-8 rounded-xl border border-indigo-500/30 bg-indigo-500/12 flex items-center justify-center text-sm text-indigo-300">
                    ◐
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Floating signal cards */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
              className="hidden sm:block absolute -left-8 -bottom-6 w-52"
            >
              <FloatingSignal label="Winning products" value="+12 today" delay={0.28} tone="success" />
            </motion.div>
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 6.4, repeat: Infinity, ease: "easeInOut" }}
              className="hidden sm:block absolute -right-8 top-8 w-56"
            >
              <FloatingSignal label="Competitor spikes" value="3 detected" delay={0.38} tone="warning" />
            </motion.div>
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut" }}
              className="hidden sm:block absolute right-6 -bottom-8 w-48"
            >
              <FloatingSignal label="New hooks" value="8 added" delay={0.48} tone="indigo" />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
