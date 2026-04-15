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
    const api = (window as any).__mulifyTheme as { mode: ThemeMode; setMode: (m: ThemeMode) => void } | undefined;
    if (api?.mode) setMode(api.mode);
    const t = setInterval(() => {
      const api2 = (window as any).__mulifyTheme as { mode: ThemeMode } | undefined;
      if (api2?.mode) setMode(api2.mode);
    }, 1000);
    return () => clearInterval(t);
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
