/**
 * Turning a bank's CSV into transactions. Pure — no DB, no I/O.
 *
 * This is where real files break: Portuguese banks write "1.234,56", English
 * ones "1,234.56", some put the minus after the number, some split debit and
 * credit into two columns, and dates come as dd/mm/yyyy or yyyy-mm-dd. Getting
 * this wrong silently imports wrong amounts, so every case is tested.
 */

export interface ColumnMapping {
  date: string;
  /** Single signed amount column. Use debit/credit instead when split. */
  amount?: string;
  /** Two-column layout: money out and money in. */
  debit?: string;
  credit?: string;
  description?: string;
  merchant?: string;
}

export interface ParsedRow {
  date: Date | null;
  amount: number | null;
  description: string;
  merchant: string;
  /** Why this row can't be imported, if it can't. */
  problem: string | null;
  /** Matches something already in the account. */
  duplicate: boolean;
  raw: Record<string, string>;
}

/**
 * Parses an amount written in any of the common conventions.
 *
 * The decimal separator is decided by which of "." and "," comes LAST — in
 * "1.234,56" the comma is decimal, in "1,234.56" the dot is. A lone separator
 * with exactly three digits after it ("1.234") is read as a thousands group,
 * because that's what banks mean.
 */
export function parseAmount(input: string): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (s === "") return null;

  // Currency symbols, spaces (including non-breaking) and stray text.
  s = s.replace(/[€$£\s ]/g, "");
  if (s === "") return null;

  let negative = false;

  // (123,45) means negative in some exports.
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Trailing minus: "123,45-"
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the later one is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    const decimals = s.length - lastComma - 1;
    // "1,234" is a thousands group; "12,5" and "12,50" are decimals.
    s = decimals === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot !== -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }

  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Parses a date in the formats banks actually use.
 *
 * Day-first is assumed for ambiguous slash dates (01/02/2026 = 1 February),
 * which is the European convention and what every bank the user has writes.
 */
export function parseDate(input: string): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (s === "") return null;

  // yyyy-mm-dd or yyyy/mm/dd
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));

  // dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return makeDate(Number(m[3]), Number(m[2]), Number(m[1]));

  // dd-mm-yy
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) {
    const year = Number(m[3]);
    return makeDate(year + (year < 70 ? 2000 : 1900), Number(m[2]), Number(m[1]));
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  // Rejects things like 31 February, which JS would roll over silently.
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

const DATE_HINTS = ["date", "data", "datum", "fecha", "data valor", "data mov", "value date", "booking date"];
const AMOUNT_HINTS = ["amount", "montante", "valor", "importe", "value", "quantia"];
const DEBIT_HINTS = ["debit", "débito", "debito", "saída", "saida", "withdrawal", "paid out"];
const CREDIT_HINTS = ["credit", "crédito", "credito", "entrada", "deposit", "paid in"];
const DESCRIPTION_HINTS = ["description", "descrição", "descricao", "detalhe", "details", "concept", "narrative", "reference"];
const MERCHANT_HINTS = ["merchant", "comerciante", "payee", "beneficiário", "beneficiario", "counterparty"];

function bestMatch(headers: string[], hints: string[]): string | undefined {
  const normalized = headers.map((h) => ({ raw: h, low: h.toLowerCase().trim() }));
  // Exact match first, then "contains", so "Data Valor" doesn't beat "Data".
  for (const hint of hints) {
    const exact = normalized.find((h) => h.low === hint);
    if (exact) return exact.raw;
  }
  for (const hint of hints) {
    const partial = normalized.find((h) => h.low.includes(hint));
    if (partial) return partial.raw;
  }
  return undefined;
}

/** Guesses the mapping from the header row, so the usual case needs no work. */
export function detectColumns(headers: string[]): ColumnMapping {
  const debit = bestMatch(headers, DEBIT_HINTS);
  const credit = bestMatch(headers, CREDIT_HINTS);
  const amount = bestMatch(headers, AMOUNT_HINTS);

  return {
    date: bestMatch(headers, DATE_HINTS) ?? "",
    // A split debit/credit layout only counts if BOTH are present; otherwise a
    // column called "Credit" alone is more likely a balance or a label.
    ...(debit && credit ? { debit, credit } : { amount: amount ?? "" }),
    description: bestMatch(headers, DESCRIPTION_HINTS),
    merchant: bestMatch(headers, MERCHANT_HINTS),
  };
}

/** Deterministic key for spotting a row already imported. */
export function dedupKey(date: Date, amount: number, description: string): string {
  return `${date.toISOString().slice(0, 10)}|${amount.toFixed(2)}|${description.trim().toLowerCase()}`;
}

/**
 * Applies a mapping to raw CSV rows, flagging what can't be imported and what
 * looks like a duplicate. Nothing is written; this is what the preview shows.
 */
export function buildRows(
  raw: Record<string, string>[],
  mapping: ColumnMapping,
  existingKeys: Set<string> = new Set()
): ParsedRow[] {
  const seen = new Set(existingKeys);

  return raw.map((row) => {
    const date = parseDate(row[mapping.date] ?? "");
    const description = (mapping.description ? (row[mapping.description] ?? "") : "").trim();
    const merchant = (mapping.merchant ? (row[mapping.merchant] ?? "") : "").trim();

    let amount: number | null = null;
    if (mapping.debit || mapping.credit) {
      const debit = mapping.debit ? parseAmount(row[mapping.debit] ?? "") : null;
      const credit = mapping.credit ? parseAmount(row[mapping.credit] ?? "") : null;
      // Debit is money out, so it becomes negative regardless of how it's written.
      if (debit !== null && debit !== 0) amount = -Math.abs(debit);
      else if (credit !== null && credit !== 0) amount = Math.abs(credit);
      else amount = null;
    } else if (mapping.amount) {
      amount = parseAmount(row[mapping.amount] ?? "");
    }

    let problem: string | null = null;
    if (date === null) problem = "Unreadable date";
    else if (amount === null) problem = "Unreadable amount";
    else if (amount === 0) problem = "Zero amount";

    let duplicate = false;
    if (problem === null && date && amount !== null) {
      const key = dedupKey(date, amount, description);
      duplicate = seen.has(key);
      seen.add(key);
    }

    return { date, amount, description, merchant, problem, duplicate, raw: row };
  });
}

export interface ImportSummary {
  total: number;
  importable: number;
  duplicates: number;
  invalid: number;
  net: number;
}

export function summarize(rows: ParsedRow[]): ImportSummary {
  const invalid = rows.filter((r) => r.problem !== null).length;
  const duplicates = rows.filter((r) => r.problem === null && r.duplicate).length;
  const importable = rows.filter((r) => r.problem === null && !r.duplicate);

  return {
    total: rows.length,
    importable: importable.length,
    duplicates,
    invalid,
    net: round2(importable.reduce((s, r) => s + (r.amount ?? 0), 0)),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
