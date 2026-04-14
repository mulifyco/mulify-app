"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LoadDemoWorkspaceButton from "@/components/launch/LoadDemoWorkspaceButton";

const STORAGE_KEY = "mulify:onboarding_strip_dismissed:v1";

type Props = {
  /** Stronger checklist when the library has no footprint yet. */
  boosted?: boolean;
  demoSeeded?: boolean;
  demoReportHref?: string;
};

export default function OnboardingHelperStrip({ boosted, demoSeeded, demoReportHref }: Props) {
  /** null = not hydrated yet (avoid flash before reading localStorage) */
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        setDismissed(false);
      }
    });
  }, []);

  const steps = useMemo(() => {
    if (boosted) {
      return [
        { label: "Add a source", href: "/sources", hint: "Connect Meta/TikTok/Shopify inputs." },
        {
          label: "Try compare",
          href: "/compare?domains=sample-brand-a.demo,sample-brand-b.demo",
          hint: "Side-by-side sample domains (or your watchlist after demo load).",
        },
        { label: "Ready to Scale", href: "/boards/ready-to-scale", hint: "Highest-upside product clusters." },
        {
          label: "Demo report",
          href: demoReportHref ?? "/reports",
          hint: "Executive-style snapshot (after sample workspace load).",
        },
        { label: "Lead pipeline", href: "/leads", hint: "Sample CRM stages from launch kit." },
      ];
    }
    return [
      { label: "Add a source", href: "/sources", hint: "Connect Meta/TikTok/Shopify inputs." },
      { label: "Create a watchlist", href: "/watchlists", hint: "Track competitor domains and spikes." },
      { label: "Open Ready to Scale", href: "/boards/ready-to-scale", hint: "Start with highest-upside clusters." },
    ];
  }, [boosted, demoReportHref]);

  if (dismissed === null || dismissed) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-muted uppercase tracking-[0.18em]">
          {boosted ? "Launch checklist" : "Getting started"}
        </div>
        <div className="text-sm text-foreground mt-1">
          {boosted
            ? "Your workspace has no data yet — load a guided sample or connect a live source."
            : "Three quick steps to start generating shareable intelligence."}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {steps.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="px-3 py-1.5 text-xs rounded border border-border hover:bg-surface-2"
            title={s.hint}
          >
            {s.label} →
          </Link>
        ))}
        {boosted && !demoSeeded ? (
          <LoadDemoWorkspaceButton label="Load sample workspace" className="px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-500" />
        ) : null}
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, "1");
            } catch {
              // ignore
            }
            setDismissed(true);
          }}
          className="px-3 py-1.5 text-xs rounded bg-foreground text-background hover:opacity-90"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
