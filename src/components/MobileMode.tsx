"use client";

import { useSyncExternalStore } from "react";
import { PHONE_QUERY } from "@/lib/ui/panels";

export type MobileMode = "simple" | "complex";
const STORAGE_KEY = "moneyos_mobile_mode";
const listeners = new Set<() => void>();

function notify() { listeners.forEach(listener => listener()); }
function readMode(): MobileMode {
  return document.documentElement.dataset.mobileUi === "simple" ? "simple" : "complex";
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    document.documentElement.dataset.mobileUi = event.newValue === "simple" ? "simple" : "complex";
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
function subscribePhone(listener: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function useMobileMode() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "complex" as const);
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
  return { mode, phone, simple: phone && mode === "simple" };
}

function setMode(mode: MobileMode) {
  document.documentElement.dataset.mobileUi = mode;
  try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* The current session still works without storage. */ }
  notify();
}

export default function MobileModeSwitch() {
  const { mode } = useMobileMode();
  return (
    <div className="mobile-mode-picker" role="group" aria-label="Mobile display mode">
      <button type="button" aria-pressed={mode === "simple"} onClick={() => setMode("simple")}>
        <span>Simple</span><small>The essentials</small>
      </button>
      <button type="button" aria-pressed={mode === "complex"} onClick={() => setMode("complex")}>
        <span>Complex</span><small>All options</small>
      </button>
    </div>
  );
}
