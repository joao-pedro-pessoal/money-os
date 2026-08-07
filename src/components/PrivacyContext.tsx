"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface PrivacyCtx {
  hidden: boolean;
  toggle: () => void;
}

const Ctx = createContext<PrivacyCtx>({ hidden: false, toggle: () => {} });

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("moneyos_privacy");
    if (stored === "1") setHidden(true);
  }, []);

  const toggle = () => {
    setHidden((h) => {
      window.localStorage.setItem("moneyos_privacy", !h ? "1" : "0");
      return !h;
    });
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
export function Money({ value, currency = "EUR" }: { value: number; currency?: string }) {
  const { hidden } = usePrivacy();
  if (hidden) return <span>••••••</span>;
  const formatted = new Intl.NumberFormat("pt-PT", { style: "currency", currency }).format(value);
  return <span>{formatted}</span>;
}
