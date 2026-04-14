"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/admin/Sidebar";

export default function AdminShell({
  children,
  demoWorkspace,
}: {
  children: React.ReactNode;
  demoWorkspace?: boolean;
}) {
  const [navOpen, setNavOpen] = useState(false);

  const closeNav = useCallback(() => setNavOpen(false), []);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setNavOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-sm"
      >
        Menu
      </button>

      {navOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={closeNav}
        />
      ) : null}

      <div
        className={[
          "fixed md:static inset-y-0 left-0 z-50 w-[min(17.5rem,88vw)] md:w-56 shrink-0 transform transition-transform duration-200 ease-out md:transform-none",
          navOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        ].join(" ")}
      >
        <Sidebar onNavigate={closeNav} />
      </div>

      <main className="flex-1 min-h-screen overflow-y-auto border-l border-border pt-14 md:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-5 sm:py-6 lg:px-8">
          {demoWorkspace ? (
            <div className="mb-4 rounded-lg border border-indigo-500/35 bg-indigo-500/10 px-3 py-2 text-xs text-foreground">
              <span className="font-semibold">Sample workspace loaded</span>
              <span className="text-muted"> — watchlist, alerts, leads, and a demo report are seeded for onboarding. Add live sources when you are ready.</span>
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
