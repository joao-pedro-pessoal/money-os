/**
 * Reading a broker event out of one line of prose.
 *
 * Some exports arrive with the structure flattened away — a date, an amount, and
 * a sentence. This app's own bank format is one of them, and a Trade Republic
 * export converted into it looks like this:
 *
 *   Savings plan execution LU1681048804 Amundi Index Solutions - Amundi S&P 500
 *   UCITS ETF - EUR (C), quantity: 0.1
 *
 * Every field the importer needs is in there: what happened, which instrument,
 * and how many shares. Refusing the file because the columns are missing would
 * be throwing away information that is plainly present.
 *
 * This is deliberately narrow. It reads the phrases these exports actually use,
 * and returns null for anything else rather than guessing from a keyword — a
 * sentence mentioning "sale" is not necessarily a sale, and a wrongly typed row
 * corrupts a position silently.
 *
 * Pure — no DB, no I/O.
 */

import type { EventKind } from "./broker";
import { normaliseIsin } from "../portfolio/isin";

export interface DescribedEvent {
  kind: EventKind | null;
  isin: string | null;
  /** The instrument's name as written, when the line carries one. */
  name: string | null;
  quantity: number | null;
}

/**
 * Opening phrases, longest first.
 *
 * Order matters: "Your interest payment" has to be tested before "interest
 * payment" would match something else, and matching on the *start* of the line
 * rather than anywhere in it is what keeps "Cash Dividend for ISIN …" from
 * being read as a purchase because the instrument's name contains "DIVIDEND".
 * That is not hypothetical — one of the holdings in the file that prompted this
 * is literally called "DIVIDEND 15 SPLIT A CD 15".
 */
const OPENINGS: { phrase: string; kind: EventKind }[] = [
  { phrase: "savings plan execution", kind: "BUY" },
  { phrase: "buy trade", kind: "BUY" },
  { phrase: "sell trade", kind: "SELL" },
  { phrase: "cash dividend for isin", kind: "DIVIDEND" },
  { phrase: "cash dividend", kind: "DIVIDEND" },
  { phrase: "your interest payment", kind: "INTEREST" },
  { phrase: "interest payment", kind: "INTEREST" },
  { phrase: "card top up", kind: "DEPOSIT" },
  { phrase: "incoming transfer", kind: "DEPOSIT" },
  { phrase: "deposito aceite", kind: "DEPOSIT" },
  { phrase: "outgoing transfer", kind: "WITHDRAWAL" },
  { phrase: "payout", kind: "WITHDRAWAL" },
];

/** Accents folded so "Depósito" matches, and collapsed whitespace. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * An ISIN anywhere in the line, verified by its check digit.
 *
 * Verification is what makes this safe to run over free text: a twelve-character
 * word that isn't an ISIN fails the checksum and is ignored, so an instrument
 * name can't accidentally supply one.
 */
function findIsin(text: string): { isin: string; at: number; length: number } | null {
  const candidates = text.match(/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g) ?? [];

  for (const candidate of candidates) {
    const isin = normaliseIsin(candidate);
    if (isin) return { isin, at: text.indexOf(candidate), length: candidate.length };
  }
  return null;
}

/** `, quantity: 0.000291` — written with a dot, however the amounts are written. */
function findQuantity(text: string): number | null {
  const match = text.match(/quantity:\s*(-?[\d.,]+)/i);
  if (!match) return null;

  // A comma here would be a thousands separator, not a decimal point: the
  // examples use dots even in files whose amounts use commas.
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value !== 0 ? Math.abs(value) : null;
}

export function readDescription(raw: string | null | undefined): DescribedEvent {
  const text = (raw ?? "").trim();
  const empty: DescribedEvent = { kind: null, isin: null, name: null, quantity: null };
  if (text === "") return empty;

  const folded = fold(text);
  const opening = OPENINGS.find((o) => folded.startsWith(o.phrase));
  if (!opening) return empty;

  const found = findIsin(text);
  const quantity = findQuantity(text);

  /**
   * The name is what sits between the ISIN and the quantity.
   *
   * Taken positionally rather than by pattern, because an instrument can be
   * called anything at all — including things that look like keywords.
   */
  let name: string | null = null;
  if (found) {
    const after = text.slice(found.at + found.length);
    const trimmed = after.split(/,\s*quantity:/i)[0].trim().replace(/^[-–—:]\s*/, "");
    name = trimmed === "" ? null : trimmed;
  }

  return { kind: opening.kind, isin: found?.isin ?? null, name, quantity };
}

/**
 * Would this file be readable through its descriptions alone?
 *
 * Used to tell a broker export that lost its columns from an ordinary bank
 * statement, which is the difference between "import this elsewhere" and "this
 * has nothing to do with investing".
 */
export function describableRows(descriptions: readonly (string | null)[]): number {
  return descriptions.filter((d) => readDescription(d).kind !== null).length;
}
