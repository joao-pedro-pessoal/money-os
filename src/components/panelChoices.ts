"use client";

import { useSyncExternalStore } from "react";
import { panelChoice } from "@/lib/ui/panels";

const listeners = new Set<() => void>();
/** Explicit choices only; also works for a session with storage disabled. */
const memory = new Map<string, string>();

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key === null) memory.clear();
  else if (event.key.startsWith("money-os:panel:") || event.key.startsWith("money-os:fold:")) memory.delete(event.key);
  else return;
  notify();
}

export function subscribePanelChoices(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export interface LegacyPanelKeys {
  prefix: string;
  simple: boolean;
}

export function readPanelChoice(key: string, legacy?: LegacyPanelKeys): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) return saved;
    if (legacy) {
      const candidates: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const previousKey = localStorage.key(i);
        if (!previousKey?.startsWith(legacy.prefix) || previousKey.endsWith(":simple") !== legacy.simple) continue;
        const previous = localStorage.getItem(previousKey);
        if (panelChoice(previous, true) !== null || panelChoice(previous, false) !== null) candidates.push(previous!);
      }
      // A translated heading used to be part of the key. Do not guess which
      // choice belongs here if more than one old heading has been saved.
      if (candidates.length === 1) return candidates[0];
    }
  } catch { /* Storage is optional. */ }
  return null;
}

export function writePanelChoice(key: string, value: string) {
  memory.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* Keep the choice for this session. */ }
  notify();
}

export function usePanelChoice(key: string, legacy?: LegacyPanelKeys) {
  return useSyncExternalStore(subscribePanelChoices, () => readPanelChoice(key, legacy), () => null);
}

/** Server and hydration render agree before reading the screen and storage. */
export function usePanelsReady() {
  return useSyncExternalStore(subscribePanelChoices, () => true, () => false);
}
