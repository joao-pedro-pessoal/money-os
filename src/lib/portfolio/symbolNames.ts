import { shortName } from "./shortName";

/**
 * Your names for tickers: "Physical gold" for IGLAl_EQ.
 *
 * Keyed by the symbol exactly as stored, which is what every position, trade
 * and watchlist row carries. A name is for the eye only — nothing looks an
 * instrument up by it, and the symbol underneath never changes.
 */
export type SymbolNames = Readonly<Record<string, string>>;

export const SYMBOL_NAME_MAX = 60;

/** The name as typed, tidied; null when it was cleared, which removes it. */
export function cleanSymbolName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name === "") return null;
  if (name.length > SYMBOL_NAME_MAX) throw new Error(`A name has at most ${SYMBOL_NAME_MAX} characters.`);
  return name;
}

/** The symbol a form sent, refused when it cannot be one. */
export function cleanSymbol(raw: string): string {
  const symbol = raw.trim();
  if (symbol === "" || symbol.length > 300 || /[\u0000-\u001f]/.test(symbol)) throw new Error("That is not a symbol.");
  return symbol;
}

/**
 * What to call a symbol where only text fits — a widget, a PDF, a CSV: your
 * name for it, or else the symbol shortened as the tables shorten it.
 */
export function symbolLabel(symbol: string | null | undefined, names: SymbolNames): string {
  if (!symbol) return "";
  return names[symbol] ?? shortName(symbol);
}

/**
 * The symbols worth offering a name for, most relevant first: what is held,
 * then what was traded, then what is only watched. Each once, in the order
 * first seen within its group.
 */
export function symbolsToName(groups: { held: readonly string[]; traded: readonly string[]; watched: readonly string[] }) {
  const seen = new Set<string>();
  const out: { symbol: string; where: "held" | "traded" | "watched" }[] = [];
  for (const where of ["held", "traded", "watched"] as const) {
    for (const raw of groups[where]) {
      const symbol = raw?.trim();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      out.push({ symbol, where });
    }
  }
  return out;
}
