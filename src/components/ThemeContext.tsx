"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const THEMES = [
  { id: "capital-gold", label: "Capital Gold", swatch: "#c9a86a", bg: "#141210" },
  { id: "emerald-ledger", label: "Emerald Ledger", swatch: "#1d9e75", bg: "#0e1613" },
  { id: "slate-indigo", label: "Slate Indigo", swatch: "#6366f1", bg: "#0b0d12" },
  { id: "warm-ivory", label: "Warm Ivory", swatch: "#c9862a", bg: "#faf6ee" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
const DEFAULT_THEME: ThemeId = "capital-gold";

interface ThemeCtx {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  toggleLightDark: () => void;
  isLight: boolean;
}

const Ctx = createContext<ThemeCtx>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggleLightDark: () => {},
  isLight: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const stored = window.localStorage.getItem("moneyos_theme") as ThemeId | null;
    const initial = stored && THEMES.some((t) => t.id === stored) ? stored : DEFAULT_THEME;
    setThemeState(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    window.localStorage.setItem("moneyos_theme", t);
  };

  // Quick sun/moon shortcut: flips between the current accent's dark theme and Warm Ivory (light).
  const toggleLightDark = () => {
    if (theme === "warm-ivory") {
      const previous = (window.localStorage.getItem("moneyos_theme_before_light") as ThemeId) || "capital-gold";
      setTheme(previous);
    } else {
      window.localStorage.setItem("moneyos_theme_before_light", theme);
      setTheme("warm-ivory");
    }
  };

  return (
    <Ctx.Provider value={{ theme, setTheme, toggleLightDark, isLight: theme === "warm-ivory" }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}
