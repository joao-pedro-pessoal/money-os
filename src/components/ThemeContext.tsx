"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

export const ACCENTS = [
  { id: "gold", label: "Gold", swatch: "#c9a86a" },
  { id: "emerald", label: "Emerald", swatch: "#1d9e75" },
  { id: "indigo", label: "Indigo", swatch: "#6366f1" },
  /**
   * No hue at all. The other themes tint their greys, which is what keeps them
   * from reading as genuinely black or white — this one doesn't, so the dark
   * mode is true black and the light mode is true white.
   */
  { id: "mono", label: "Monochrome", swatch: "#ffffff" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
export type ModeId = "dark" | "light";

/**
 * Whether colour is allowed to carry meaning on the monochrome themes.
 *
 * A third axis rather than two more accents, because it changes two things and
 * not a palette: the good/bad pair, and the categorical colours that tell one
 * asset from another. Everything else stays black and white.
 *
 * "mono" is the default, so the monochrome theme is monochrome until asked
 * otherwise. It has no effect on the colour accents, whose signals are already
 * in colour — the picker only offers it where it does something.
 */
export type SignalId = "mono" | "colour";

const DEFAULT_ACCENT: AccentId = "gold";
const DEFAULT_MODE: ModeId = "dark";
const DEFAULT_SIGNAL: SignalId = "mono";

interface ThemeCtx {
  accent: AccentId;
  mode: ModeId;
  signal: SignalId;
  setAccent: (a: AccentId) => void;
  setMode: (m: ModeId) => void;
  setSignal: (s: SignalId) => void;
  toggleMode: () => void;
}

const Ctx = createContext<ThemeCtx>({
  accent: DEFAULT_ACCENT,
  mode: DEFAULT_MODE,
  signal: DEFAULT_SIGNAL,
  setAccent: () => {},
  setMode: () => {},
  setSignal: () => {},
  toggleMode: () => {},
});

function apply(accent: AccentId, mode: ModeId, signal: SignalId) {
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.signal = signal;
}

/**
 * The theme is already on the page before React runs.
 *
 * An inline script in the document head reads localStorage and sets the
 * dataset, so there is no flash of the default theme. That makes the DOM the
 * source of truth here, and this reads it rather than reaching for storage a
 * second time — one place decides, everything else follows.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readAccent(): AccentId {
  const fromDom = document.documentElement.dataset.accent as AccentId | undefined;
  return fromDom && ACCENTS.some((a) => a.id === fromDom) ? fromDom : DEFAULT_ACCENT;
}

function readMode(): ModeId {
  return document.documentElement.dataset.mode === "light" ? "light" : DEFAULT_MODE;
}

function readSignal(): SignalId {
  return document.documentElement.dataset.signal === "colour" ? "colour" : DEFAULT_SIGNAL;
}

/** No DOM on the server, so it renders the defaults the script would fall back to. */
const serverAccent = (): AccentId => DEFAULT_ACCENT;
const serverMode = (): ModeId => DEFAULT_MODE;
const serverSignal = (): SignalId => DEFAULT_SIGNAL;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const accent = useSyncExternalStore(subscribe, readAccent, serverAccent);
  const mode = useSyncExternalStore(subscribe, readMode, serverMode);
  const signal = useSyncExternalStore(subscribe, readSignal, serverSignal);

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const setAccent = (a: AccentId) => {
    apply(a, mode, signal);
    try {
      window.localStorage.setItem("moneyos_accent", a);
    } catch {
      // Storage unavailable: the theme still applies for this session.
    }
    notify();
  };

  const setMode = (m: ModeId) => {
    apply(accent, m, signal);
    try {
      window.localStorage.setItem("moneyos_mode", m);
    } catch {
      // As above.
    }
    notify();
  };

  const setSignal = (s: SignalId) => {
    apply(accent, mode, s);
    try {
      window.localStorage.setItem("moneyos_signal", s);
    } catch {
      // As above.
    }
    notify();
  };

  const toggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  return (
    <Ctx.Provider value={{ accent, mode, signal, setAccent, setMode, setSignal, toggleMode }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}
