"use client";

import { createContext, useContext, useEffect, useState } from "react";

export const ACCENTS = [
  { id: "gold", label: "Gold", swatch: "#c9a86a" },
  { id: "emerald", label: "Emerald", swatch: "#1d9e75" },
  { id: "indigo", label: "Indigo", swatch: "#6366f1" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
export type ModeId = "dark" | "light";

const DEFAULT_ACCENT: AccentId = "gold";
const DEFAULT_MODE: ModeId = "dark";

interface ThemeCtx {
  accent: AccentId;
  mode: ModeId;
  setAccent: (a: AccentId) => void;
  setMode: (m: ModeId) => void;
  toggleMode: () => void;
}

const Ctx = createContext<ThemeCtx>({
  accent: DEFAULT_ACCENT,
  mode: DEFAULT_MODE,
  setAccent: () => {},
  setMode: () => {},
  toggleMode: () => {},
});

function apply(accent: AccentId, mode: ModeId) {
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.mode = mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentId>(DEFAULT_ACCENT);
  const [mode, setModeState] = useState<ModeId>(DEFAULT_MODE);

  useEffect(() => {
    const storedAccent = window.localStorage.getItem("moneyos_accent") as AccentId | null;
    const storedMode = window.localStorage.getItem("moneyos_mode") as ModeId | null;
    const initialAccent = storedAccent && ACCENTS.some((a) => a.id === storedAccent) ? storedAccent : DEFAULT_ACCENT;
    const initialMode = storedMode === "light" || storedMode === "dark" ? storedMode : DEFAULT_MODE;
    setAccentState(initialAccent);
    setModeState(initialMode);
    apply(initialAccent, initialMode);
  }, []);

  const setAccent = (a: AccentId) => {
    setAccentState(a);
    apply(a, mode);
    window.localStorage.setItem("moneyos_accent", a);
  };

  const setMode = (m: ModeId) => {
    setModeState(m);
    apply(accent, m);
    window.localStorage.setItem("moneyos_mode", m);
  };

  const toggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  return <Ctx.Provider value={{ accent, mode, setAccent, setMode, toggleMode }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
