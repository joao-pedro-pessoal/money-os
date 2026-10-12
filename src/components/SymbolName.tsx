"use client";

import { createContext, useContext } from "react";
import { shortName } from "@/lib/portfolio/shortName";
import type { SymbolNames } from "@/lib/portfolio/symbolNames";

const NamesContext = createContext<SymbolNames>({});

/** Your names for tickers, read once by the layout for every page under it. */
export function SymbolNamesProvider({ names, children }: { names: SymbolNames; children: React.ReactNode }) {
  return <NamesContext.Provider value={names}>{children}</NamesContext.Provider>;
}

/**
 * A ticker on screen: the name you gave it, with the ticker itself small
 * beside it, or the ticker alone when it has no name.
 *
 * `short` shortens a stored legal name ("iShares VII plc - iShares Core S&P
 * 500…") the way the holdings table always has. Never translated: a name and
 * a ticker are both yours, in any language.
 */
export default function SymbolName({ symbol, short = false }: { symbol: string | null | undefined; short?: boolean }) {
  const names = useContext(NamesContext);
  if (!symbol) return <span>—</span>;
  const shown = short ? shortName(symbol) : symbol;
  const name = names[symbol];
  if (!name) {
    return (
      <span translate="no" title={short && shown !== symbol ? symbol : undefined}>
        {shown}
      </span>
    );
  }
  return (
    <span translate="no" title={symbol}>
      {name}
      <span className="ml-1 text-[0.8em] font-normal text-[var(--muted)]">{shown}</span>
    </span>
  );
}
