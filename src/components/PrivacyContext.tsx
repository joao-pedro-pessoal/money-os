"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { fmt } from "@/lib/format";

interface PrivacyCtx {
  hidden: boolean;
  toggle: () => void;
}

const Ctx = createContext<PrivacyCtx>({ hidden: false, toggle: () => {} });

const KEY = "moneyos_privacy";

/** Shared across amounts; the current choice works even if storage is blocked. */
const listeners = new Set<() => void>();
let sessionHidden: boolean | undefined;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab toggling it should be reflected here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    sessionHidden = event.newValue === "1";
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readHidden(): boolean {
  if (sessionHidden !== undefined) return sessionHidden;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // With no saved or session choice, use the initial visible state.
    return false;
  }
}

/** The server has no storage, so it always renders the un-hidden state. */
function serverSnapshot(): boolean {
  return false;
}

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const hidden = useSyncExternalStore(subscribe, readHidden, serverSnapshot);

  const toggle = () => {
    sessionHidden = !readHidden();
    try {
      window.localStorage.setItem(KEY, sessionHidden ? "1" : "0");
    } catch {
      // Nothing to do — the toggle still applies for this session below.
    }
    for (const listener of listeners) listener();
  };

  return <Ctx.Provider value={{ hidden, toggle }}>{children}</Ctx.Provider>;
}

export function usePrivacy() {
  return useContext(Ctx);
}

/**
 * Renders the amount, or a masked placeholder when Privacy Mode is on.
 *
 * `currency` is the currency of THIS amount. Totals are converted to the base
 * currency before rendering, so callers pass the base there; per-account
 * figures pass the account's own currency.
 */
/**
 * A number that is money, whose currency nobody knows.
 *
 * A price quoted by a venue that never says what it is quoted in — a synced
 * position's entry, mark and liquidation. `positions` has no currency column
 * for them, and Trading 212 prices two of its instruments in dollars while
 * reporting the account in euros, so the platform's currency is not the
 * answer either.
 *
 * Formatted like money and labelled as none, because a symbol is a claim.
 * `<Money>` defaults to EUR, which turned every one of those into a real
 * amount of the wrong money.
 *
 * Hidden by privacy mode like any other figure — it is still your position.
 */
export function Bare({ value }: { value: number }) {
  const { hidden } = usePrivacy();
  if (hidden) return <span>••••••</span>;
  return (
    <span>{new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2 }).format(value)}</span>
  );
}

export function Money({ value, currency = "EUR" }: { value: number; currency?: string }) {
  const { hidden } = usePrivacy();
  if (hidden) return <span>••••••</span>;
  const formatted = fmt(value, currency);
  return <span>{formatted}</span>;
}
