"use client";

import { motion } from "framer-motion";

export default function AdminPageShell({
  title,
  description,
  breadcrumb,
  actions,
  freshness,
  children,
}: {
  title?: string;
  description?: string;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  freshness?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {(title || actions || breadcrumb || freshness) && (
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-5 lg:-mx-8 px-4 sm:px-5 lg:px-8 py-3.5 border-b border-border/60 bg-card/40 glass">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {breadcrumb ? (
                <div className="text-[10px] font-semibold text-muted-2 uppercase tracking-[0.18em] mb-0.5">
                  {breadcrumb}
                </div>
              ) : null}
              {title ? (
                <div className="text-lg font-semibold tracking-tight text-foreground truncate">{title}</div>
              ) : null}
              {description ? (
                <div className="text-xs text-muted mt-0.5 max-w-2xl leading-relaxed">{description}</div>
              ) : null}
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              {freshness}
              {actions}
            </div>
          </div>
        </div>
      )}

      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: { opacity: 0 },
          show: { opacity: 1, transition: { staggerChildren: 0.035 } },
        }}
        className="pt-5"
      >
        {children ?? null}
      </motion.div>
    </motion.div>
  );
}
