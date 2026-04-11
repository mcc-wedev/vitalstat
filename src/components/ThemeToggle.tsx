"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "vitalstat-theme";

/**
 * ═══════════════════════════════════════════════════════════════
 *  THEME TOGGLE — dark (default) / light
 *
 *  Writes [data-theme="light"] on <html> and persists to
 *  localStorage. A tiny inline script in layout.tsx reads the same
 *  key on first paint to avoid FOUC.
 * ═══════════════════════════════════════════════════════════════
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(KEY) as Theme | null;
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {}
  }, []);

  const apply = (t: Theme) => {
    setTheme(t);
    try { localStorage.setItem(KEY, t); } catch {}
    if (t === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  };

  if (!mounted) return null;

  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={() => apply(isLight ? "dark" : "light")}
      className="pill text-[13px] flex items-center gap-1.5"
      title={isLight ? "Comuta pe tema intunecata" : "Comuta pe tema luminoasa"}
      aria-label="Comuta tema"
    >
      {isLight ? (
        // moon icon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // sun icon
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
