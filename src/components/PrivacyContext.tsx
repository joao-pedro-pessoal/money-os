"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

interface PrivacyCtx {
  hidden: boolean;
  toggle: () => void;
}

const Ctx = createContext<PrivacyCtx>({ hidden: false, toggle: () => {} });

const KEY = "moneyos_privacy";

/**
 * Privacy mode, read from storage without an effect.
 *
 * The obvious version — `useState(false)` plus a `useEffect` that reads
 * localStorage and calls `setState` — renders once with the wrong answer and
 * then again with the right one. For this particular flag that means every
 * figure on the page is briefly *visible* to someone who asked for them to be
 * hidden, which is the one thing the feature exists to prevent.
 *
 * `useSyncExternalStore` is built for exactly this: a server snapshot, a client
 * snapshot, and a subscription. React knows the two may differ and handles it
 * without a hydration mismatch.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab toggling it should be reflected here too.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Not hidden is
    // the safe default: the app still works, it just doesn't remember.
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
    try {
      window.localStorage.setItem(KEY, hidden ? "0" : "1");
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
  const formatted = new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
  return <span>{formatted}</span>;
}
