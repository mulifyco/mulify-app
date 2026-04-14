"use client";

import { motion } from "framer-motion";

export default function FloatingSignalCard({
  label,
  value,
  delta,
  tone = "default",
  delay = 0,
  floatY = 8,
  floatDuration = 5,
  className = "",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "default" | "success" | "warning" | "indigo" | "purple";
  delay?: number;
  floatY?: number;
  floatDuration?: number;
  className?: string;
}) {
  const toneMap: Record<string, string> = {
    default: "text-foreground",
    success: "text-emerald-300",
    warning: "text-amber-300",
    indigo: "text-indigo-300",
    purple: "text-purple-300",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      <motion.div
        animate={{ y: [0, -floatY, 0] }}
        transition={{ duration: floatDuration, repeat: Infinity, ease: "easeInOut" }}
        className={`rounded-2xl border border-border bg-card/65 glass premium-ring px-4 py-3 ${className}`}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-2">{label}</div>
        <div className={`mt-1 text-sm font-semibold ${toneMap[tone]}`}>{value}</div>
        {delta ? <div className="text-[10px] text-muted mt-0.5">{delta}</div> : null}
      </motion.div>
    </motion.div>
  );
}
