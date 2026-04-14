"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function PremiumMetricCard({
  title,
  value,
  delta,
  trend,
  icon,
  status,
  sparklineSlot,
  href,
}: {
  title: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon?: React.ReactNode;
  status?: "success" | "warning" | "danger" | "default";
  sparklineSlot?: React.ReactNode;
  href?: string;
}) {
  const tone =
    status === "success"
      ? "border-emerald-500/25 shadow-[0_0_0_1px_rgba(34,197,94,0.08),0_22px_60px_rgba(0,0,0,0.35)]"
      : status === "warning"
        ? "border-amber-500/25 shadow-[0_0_0_1px_rgba(245,158,11,0.10),0_22px_60px_rgba(0,0,0,0.35)]"
        : status === "danger"
          ? "border-red-500/25 shadow-[0_0_0_1px_rgba(239,68,68,0.10),0_22px_60px_rgba(0,0,0,0.35)]"
          : "border-border shadow-[0_0_0_1px_rgba(168,177,206,0.08),0_22px_60px_rgba(0,0,0,0.35)]";

  const deltaChip =
    delta && delta.trim()
      ? status === "success"
        ? "bg-emerald-500/10 text-emerald-200 border-emerald-500/25"
        : status === "warning"
          ? "bg-amber-500/10 text-amber-200 border-amber-500/25"
          : status === "danger"
            ? "bg-red-500/10 text-red-200 border-red-500/25"
            : "bg-indigo-500/10 text-indigo-200 border-indigo-500/25"
      : null;

  const Card = (
    <motion.div
      whileHover={{ y: -2, scale: 1.015 }}
      transition={{ type: "spring", stiffness: 320, damping: 26 }}
      className={[
        "group relative rounded-2xl border bg-card/70 glass p-4 premium-ring overflow-hidden",
        tone,
      ].join(" ")}
    >
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="absolute -inset-24 bg-[radial-gradient(circle_at_30%_20%,rgba(109,93,246,0.28),transparent_55%)]" />
      </div>

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-2">{title}</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-foreground tabular-nums">{String(value)}</div>
          </div>
          <div className="flex items-center gap-2">
            {deltaChip ? (
              <span className={`text-[11px] px-2 py-1 rounded-full border ${deltaChip}`}>
                {trend === "up" ? "▲ " : trend === "down" ? "▼ " : ""}
                {delta}
              </span>
            ) : null}
            {icon ? (
              <div className="h-9 w-9 rounded-xl border border-border bg-surface-2/60 glass flex items-center justify-center text-foreground/90">
                {icon}
              </div>
            ) : null}
          </div>
        </div>

        {sparklineSlot ? (
          <div className="mt-3 rounded-xl border border-border bg-surface-2/40 p-2">{sparklineSlot}</div>
        ) : (
          <div className="mt-3 h-10 rounded-xl border border-border bg-surface-2/30" />
        )}
      </div>
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {Card}
      </Link>
    );
  }
  return Card;
}

