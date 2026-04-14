"use client";

import { useEffect, useState } from "react";
import type { ThemeMode } from "@/components/theme/ThemeProvider";

const MODES: ThemeMode[] = ["system", "dark", "light"];

function nextMode(m: ThemeMode): ThemeMode {
  const i = MODES.indexOf(m);
  return MODES[(i + 1) % MODES.length]!;
}

function label(m: ThemeMode): string {
  if (m === "system") return "Auto";
  if (m === "dark") return "Dark";
  return "Light";
}

function icon(m: ThemeMode): string {
  if (m === "system") return "◑";
  if (m === "dark") return "☽";
  return "☀";
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    // Sync initial mode from ThemeProvider API
    const api = (window as any).__mulifyTheme as { mode: ThemeMode } | undefined;
    if (api?.mode) setMode(api.mode);

    // Listen for mode changes dispatched by ThemeProvider (replaces polling)
    const onThemeChange = (e: Event) => {
      const detail = (e as CustomEvent<{ mode: ThemeMode }>).detail;
      if (detail?.mode) setMode(detail.mode);
    };
    window.addEventListener("mulify:theme-change", onThemeChange);
    return () => window.removeEventListener("mulify:theme-change", onThemeChange);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const api = (window as any).__mulifyTheme as { setMode: (m: ThemeMode) => void; mode: ThemeMode } | undefined;
        const current = api?.mode ?? mode;
        const n = nextMode(current);
        api?.setMode?.(n);
        setMode(n);
      }}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
      style={{
        background: "var(--theme-toggle-bg)",
        border: "1px solid var(--theme-toggle-border)",
        color: "var(--theme-toggle-text)",
      }}
      aria-label="Toggle theme"
      title="Cycle: Auto → Dark → Light"
    >
      <span className="text-[12px] leading-none">{icon(mode)}</span>
      <span>{label(mode)}</span>
    </button>
  );
}
