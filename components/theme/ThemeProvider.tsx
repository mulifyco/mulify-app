"use client";

import { useEffect, useMemo, useState } from "react";

export type ThemeMode = "system" | "dark" | "light";

const STORAGE_KEY = "mulify-theme";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  const resolved = mode === "system" ? (systemDark ? "dark" : "light") : mode;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "light" || v === "system" ? v : "system";
}

export function setStoredTheme(mode: ThemeMode) {
  window.localStorage.setItem(STORAGE_KEY, mode);
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const initial = getStoredTheme();
    setMode(initial);
    applyTheme(initial);

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => {
      const current = getStoredTheme();
      if (current === "system") applyTheme("system");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const api = useMemo(
    () => ({
      mode,
      setMode: (next: ThemeMode) => {
        setMode(next);
        setStoredTheme(next);
        applyTheme(next);
      },
    }),
    [mode]
  );

  // Expose minimal API for toggle via window to avoid context plumbing (keeps patch minimal).
  useEffect(() => {
    (window as any).__mulifyTheme = api;
  }, [api]);

  return <>{children}</>;
}

