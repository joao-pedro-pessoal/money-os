/**
 * Reading a broker's statement.
 *
 * The existing importer (src/lib/csv/index.ts) reads bank statements: a date,
 * an amount, a description. Pushing a broker export through it destroys the
 * part that matters — a €0.42 dividend becomes an anonymous income row with no
 * instrument attached, and a €100 deposit becomes indistinguishable from a
 * €100 gain.
 *
 * That last one is the point of this file. **Money you added is not money you
 * made.** A portfolio that went from €100 to €220 after a €100 deposit grew by
 * €20, not by 120%, and no amount of staring at a balance chart will tell you
 * which. Deposits and withdrawals are what make the difference computable.
 *
 * Pure — no DB, no I/O.
 */

import { parseCsvLine } from "../library/covers-import";
import { normaliseIsin } from "../portfolio/isin";
import { readDescription, describableRows } from "./brokerDescription";

export const EVENT_KINDS = [
  { value: "BUY", label: "Buy", affectsCash: true },
  { value: "SELL", label: "Sell", affectsCash: true },
  { value: "DIVIDEND", label: "Dividend", affectsCash: true },
  { value: "INTEREST", label: "Interest", affectsCash: true },
  { value: "DEPOSIT", label: "Deposit", affectsCash: true },
  { value: "WITHDRAWAL", label: "Withdrawal", affectsCash: true },
  { value: "FEE", label: "Fee", affectsCash: true },
] as const;

export type EventKind = (typeof EVENT_KINDS)[number]["value"];

export interface BrokerEvent {
  date: Date;
  kind: EventKind;
  /** The statement's short symbol — `IGLA`, not the API's `IGLAI_EQ`. */
  symbol: string | null;
  /**
   * The instrument's ISIN, when the statement carries one.
   *
   * Kept because it, not the symbol, is what identifies an instrument
   * unambiguously: the same ticker means different companies in different
   * countries, and the same fund trades under different tickers on different
   * exchanges. Rebuilding holdings from these rows joins on this.
   *
   * Null when absent *or* when the value failed its check digit — a wrong ISIN
   * silently matches nothing, so it is better not to have one.
   */
  isin: string | null;
  quantity: number | null;
  price: number | null;
  /** Signed: negative when money left the account. */
  amount: number;
  fees: number | null;
  currency: string;
  description: string | null;
  externalId: string | null;
  /** 1-based line in the file, so a rejected row can be pointed at. */
  line: number;
}

export interface BrokerParseResult {
  events: BrokerEvent[];
  /** Rows that couldn't be read, with the reason, rather than dropped quietly. */
  rejected: { line: number; reason: string; raw: string }[];
}

const KIND_ALIASES: Record<string, EventKind> = {
  BUY: "BUY",
  MARKETBUY: "BUY",
  LIMITBUY: "BUY",
  SELL: "SELL",
  MARKETSELL: "SELL",
  LIMITSELL: "SELL",
  DIVIDEND: "DIVIDEND",
  DIVIDENDORDINARY: "DIVIDEND",
  INTEREST: "INTEREST",
  INTERESTONCASH: "INTEREST",
  DEPOSIT: "DEPOSIT",
  TOPUP: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  WITHDRAW: "WITHDRAWAL",
  FEE: "FEE",
  FEES: "FEE",

  /**
   * The same words in the languages European brokers export in.
   *
   * Translations, not guesses about any particular broker's wording: "Kauf" is
   * German for a purchase whoever wrote it. A word this app has never seen is
   * still reported by `inspectBrokerCsv` rather than assumed, which is where a
   * broker's own vocabulary gets added from — with the file in front of us.
   */
  // German — Trade Republic, Scalable, most of the DACH brokers.
  KAUF: "BUY",
  VERKAUF: "SELL",
  DIVIDENDE: "DIVIDEND",
  ZINSEN: "INTEREST",
  EINZAHLUNG: "DEPOSIT",
  AUSZAHLUNG: "WITHDRAWAL",
  GEBUHR: "FEE",
  GEBUHREN: "FEE",

  // Portuguese.
  COMPRA: "BUY",
  VENDA: "SELL",
  DIVIDENDO: "DIVIDEND",
  DIVIDENDOS: "DIVIDEND",
  JUROS: "INTEREST",
  DEPOSITO: "DEPOSIT",
  LEVANTAMENTO: "WITHDRAWAL",
  TAXA: "FEE",
  TAXAS: "FEE",
  COMISSAO: "FEE",

  // Spanish, French, Italian and Dutch — same words, same meanings.
  VENTA: "SELL",
  INTERESES: "INTEREST",
  RETIRADA: "WITHDRAWAL",
  ACHAT: "BUY",
  VENTE: "SELL",
  DIVIDENDES: "DIVIDEND",
  INTERETS: "INTEREST",
  DEPOT: "DEPOSIT",
  RETRAIT: "WITHDRAWAL",
  FRAIS: "FEE",
  ACQUISTO: "BUY",
  VENDITA: "SELL",
  INTERESSI: "INTEREST",
  AANKOOP: "BUY",
  VERKOOP: "SELL",
  RENTE: "INTEREST",
  STORTING: "DEPOSIT",
  OPNAME: "WITHDRAWAL",
  KOSTEN: "FEE",
};

/**
 * A type word, reduced to letters — with the accents folded, not deleted.
 *
 * Stripping anything outside A–Z turned "Depósito" into DEPSITO and "Gebühr"
 * into GEBHR, so no accented word could ever match an alias. Every European
 * broker that exports in its own language was affected, and the failure looked
 * like an unrecognised type rather than a mangled one.
 *
 * NFD splits a letter from its accent so the accent can be removed on its own,
 * leaving the letter behind.
 */
function foldToLetters(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export function normaliseKind(raw: string): EventKind | null {
  return KIND_ALIASES[foldToLetters(raw)] ?? null;
}

/** The separators a broker might have used. */
export const DELIMITERS = [",", ";", "\t"] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/**
 * Which character separates the columns.
 *
 * Not a nicety. Most of continental Europe exports CSV with semicolons,
 * because the comma is already the decimal point — €1.234,56 in one cell would
 * otherwise split into two. A German broker's file read with a comma splitter
 * arrives as a single column, and the importer then says "this doesn't look
 * like a broker statement" about a perfectly good broker statement. The error
 * points at the file when the fault is here.
 *
 * Decided on the header line, where quoting is rare and the count is
 * unambiguous. A tie goes to the comma, which is the standard.
 */
export function detectDelimiter(headerLine: string): Delimiter {
  const score = (d: Delimiter) => headerLine.split(d).length - 1;

  return DELIMITERS.reduce<Delimiter>(
    (best, d) => (score(d) > score(best) ? d : best),
    ","
  );
}

export interface ColumnMatch {
  /** What the importer needs this column for. */
  role: string;
  /** The header in the file that filled it, or null. */
  header: string | null;
  required: boolean;
}

export interface BrokerCsvInspection {
  /** Whether the file can be parsed at all. */
  readable: boolean;
  delimiter: Delimiter;
  /** The header cells exactly as written in the file. */
  headers: string[];
  columns: ColumnMatch[];
  /** Roles with no column. While this is non-empty, nothing can be imported. */
  missingRequired: string[];
  rowCount: number;
  /**
   * Words in the type column the importer doesn't recognise, most common first.
   *
   * This is the useful half of the report for a broker that has never been
   * imported before: it turns "unknown type" into a precise list of the words
   * to teach it, in the file's own language.
   */
  unknownKinds: { word: string; rows: number }[];
  /** A couple of whole rows, to eyeball against what the broker's app shows. */
  sample: Record<string, string>[];
  /**
   * How many rows were understood from their description rather than a column.
   *
   * Non-zero means the file lost its structure somewhere — usually converted
   * for another importer — and is being read from the prose that survived.
   */
  describedRows: number;
  /**
   * This is a bank statement someone has brought to the broker importer.
   *
   * Worth naming rather than reporting as a generic failure, because it is the
   * most likely mistake on a page that offers both importers, and the fix is
   * one form higher up rather than anything to do with the file.
   */
  looksLikeBankStatement: boolean;
}

/** Every column the importer looks for, and the names it accepts for each. */
const COLUMN_ROLES: { role: string; required: boolean; names: string[] }[] = [
  { role: "date", required: true, names: ["date", "time", "datetime"] },
  { role: "type", required: true, names: ["type", "action", "kind"] },
  { role: "amount", required: true, names: ["amount", "total", "value"] },
  { role: "symbol", required: false, names: ["symbol", "ticker", "instrument"] },
  { role: "isin", required: false, names: ["isin", "isincode", "instrumentisin", "securityid"] },
  { role: "quantity", required: false, names: ["quantity", "shares", "qty"] },
  { role: "price", required: false, names: ["price", "priceshare", "shareprice"] },
  { role: "fees", required: false, names: ["fees", "fee", "commission"] },
  { role: "currency", required: false, names: ["currency", "currencycode"] },
  { role: "description", required: false, names: ["description", "notes", "note", "descricao", "descripcion", "beschreibung"] },
  { role: "reference", required: false, names: ["externalid", "id", "reference"] },
];

/**
 * A column name, reduced to letters and digits, accents folded.
 *
 * Same fault as the type words: "Descrição" became "descrio" and could never
 * match "descricao". A header the app half-recognises is worse than one it
 * doesn't, because the report then names a column it claims not to see.
 */
const normaliseHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Does this file describe trades rather than spending?
 *
 * The mirror of `looksLikeBankStatement`, and it exists because the mistake
 * went both ways and the second direction was the expensive one: a Trade
 * Republic transaction export was accepted by the bank importer, and 219 buys,
 * sells and dividends were filed as ordinary expenses and income. The import
 * succeeded, nothing appeared in the portfolio, and the month's cash flow was
 * quietly wrong.
 *
 * An ISIN column is decisive — a bank statement has no reason to carry one.
 * Otherwise it takes two hints together, so a "quantity" column on some bank's
 * export doesn't trigger it on its own.
 */
export function looksLikeBrokerStatement(headers: readonly string[]): boolean {
  const normalised = headers.map(normaliseHeader);
  const has = (...names: string[]) => normalised.some((h) => names.includes(h));

  if (has("isin", "isincode", "instrumentisin")) return true;

  const hints = [
    has("symbol", "ticker", "instrument"),
    has("quantity", "shares", "qty"),
    has("price", "priceshare", "shareprice"),
  ].filter(Boolean).length;

  return hints >= 2;
}

/**
 * Looks at a file and reports what it found, without throwing and without
 * importing anything.
 *
 * `parseBrokerCsv` still throws on a file it can't read, which is right for the
 * import path — refusing to write is the whole point. But a person holding an
 * export from a broker the app has never seen needs to know *which* columns
 * were not recognised, not that something was wrong. This is that answer.
 */
export function inspectBrokerCsv(text: string): BrokerCsvInspection {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");

  if (lines.length === 0) {
    return {
      readable: false,
      delimiter: ",",
      headers: [],
      columns: COLUMN_ROLES.map((r) => ({ role: r.role, header: null, required: r.required })),
      missingRequired: COLUMN_ROLES.filter((r) => r.required).map((r) => r.role),
      rowCount: 0,
      unknownKinds: [],
      sample: [],
      describedRows: 0,
      looksLikeBankStatement: false,
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const normalised = headers.map(normaliseHeader);

  const columns: ColumnMatch[] = COLUMN_ROLES.map((r) => {
    const index = normalised.findIndex((h) => r.names.includes(h));
    return { role: r.role, header: index === -1 ? null : headers[index], required: r.required };
  });

  const missingRequired = columns
    .filter((c) => c.required && c.header === null)
    // A type read from the description is a type. Reporting it as missing would
    // block a file the importer can read perfectly well.
    .map((c) => c.role);

  const typeIndex = normalised.findIndex((h) => COLUMN_ROLES[1].names.includes(h));
  const descriptionIndex = normalised.findIndex((h) =>
    COLUMN_ROLES.find((r) => r.role === "description")!.names.includes(h)
  );
  const rows = lines.slice(1);

  /**
   * Rows whose type can be read from their description instead of a column.
   *
   * A broker export flattened into a bank-shaped file keeps everything in the
   * prose. Without this the report would call it unreadable and — worse —
   * mistake it for an ordinary bank statement, sending the person to an
   * importer that would silently file their purchases as expenses.
   */
  const describable =
    typeIndex === -1 && descriptionIndex !== -1
      ? describableRows(rows.map((raw) => parseCsvLine(raw, delimiter)[descriptionIndex] ?? null))
      : 0;

  const unknown = new Map<string, number>();
  if (typeIndex !== -1) {
    for (const raw of rows) {
      const word = (parseCsvLine(raw, delimiter)[typeIndex] ?? "").trim();
      if (word === "" || normaliseKind(word) !== null) continue;
      unknown.set(word, (unknown.get(word) ?? 0) + 1);
    }
  }

  const stillMissing = missingRequired.filter((role) => !(role === "type" && describable > 0));

  return {
    readable: stillMissing.length === 0,
    delimiter,
    headers,
    columns,
    missingRequired: stillMissing,
    rowCount: rows.length,
    /** Rows this file can only be read through, not by column. */
    describedRows: describable,
    unknownKinds: [...unknown.entries()]
      .map(([word, rows]) => ({ word, rows }))
      .sort((a, b) => b.rows - a.rows),
    sample: rows.slice(0, 2).map((raw) => {
      const cells = parseCsvLine(raw, delimiter);
      return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
    }),
    // Date and amount but no type, alongside the vocabulary of spending. A
    // broker statement never has a merchant.
    looksLikeBankStatement:
      describable === 0 &&
      typeIndex === -1 &&
      normalised.some((h) => ["date", "time", "datetime"].includes(h)) &&
      normalised.some((h) => ["amount", "total", "value"].includes(h)) &&
      normalised.some((h) => ["merchant", "category", "payee", "description"].includes(h)),
  };
}

const num = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  // Accepts 1.234,56 and 1,234.56 alike: the last separator is the decimal one.
  const cleaned =
    trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/**
 * Reads a statement.
 *
 * Header-driven rather than position-driven, so a column moving doesn't
 * silently shift every value one to the left. A row missing a date, a type or
 * an amount is rejected with a reason instead of being repaired by guesswork.
 */
export function parseBrokerCsv(text: string): BrokerParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { events: [], rejected: [] };

  // Detected, not assumed: a semicolon file read with a comma splitter becomes
  // one very wide column and every row is rejected for the wrong reason.
  const delimiter = detectDelimiter(lines[0]);
  const original = parseCsvLine(lines[0], delimiter);
  // Folded exactly as `inspectBrokerCsv` folds them, or the report and the
  // parser would disagree about which columns exist.
  const headers = original.map(normaliseHeader);
  const at = (...names: string[]) => headers.findIndex((h) => names.includes(h));

  const cols = {
    date: at("date", "time", "datetime"),
    kind: at("type", "action", "kind"),
    symbol: at("symbol", "ticker", "instrument"),
    isin: at("isin", "isincode", "instrumentisin", "securityid"),
    quantity: at("quantity", "shares", "qty"),
    price: at("price", "priceshare", "shareprice"),
    amount: at("amount", "total", "value"),
    fees: at("fees", "fee", "commission"),
    currency: at("currency", "currencycode"),
    description: at("description", "notes", "note", "descricao", "descripcion", "beschreibung"),
    externalId: at("externalid", "id", "reference"),
  };

  /**
   * A file can carry its events in prose instead of columns.
   *
   * A Trade Republic export converted into this app's own bank format keeps the
   * type, the ISIN, the instrument and the quantity — all inside the
   * description. Rejecting it for a missing "type" column would be discarding
   * information that is plainly there, and the person would be told their file
   * was wrong when it wasn't.
   */
  const describedKinds =
    cols.kind === -1 && cols.description !== -1
      ? lines.slice(1).filter((raw) => {
          const cells = parseCsvLine(raw, delimiter);
          return readDescription(cells[cols.description]).kind !== null;
        }).length
      : 0;
  const readableFromDescription = describedKinds > 0;

  if (cols.date === -1 || (cols.kind === -1 && !readableFromDescription) || cols.amount === -1) {
    // Naming what was actually found, because the usual cause is a broker whose
    // columns are named something else — and "expected date, type and amount"
    // gives no clue which of the three is the problem.
    const missing = [
      cols.date === -1 ? "date" : null,
      cols.kind === -1 ? "type" : null,
      cols.amount === -1 ? "amount" : null,
    ].filter((m): m is string => m !== null);

    throw new Error(
      `This doesn't look like a broker statement: no column for ${missing.join(", ")}. ` +
        `The file has ${original.join(", ")}.`
    );
  }

  const events: BrokerEvent[] = [];
  const rejected: BrokerParseResult["rejected"] = [];

  lines.slice(1).forEach((raw, i) => {
    const line = i + 2;
    const cells = parseCsvLine(raw, delimiter);
    const cell = (index: number) => (index === -1 ? undefined : cells[index]);

    const date = new Date((cell(cols.date) ?? "").trim());
    if (Number.isNaN(date.getTime())) {
      rejected.push({ line, reason: "The date couldn't be read.", raw });
      return;
    }

    const described = readDescription(cell(cols.description));
    // The column wins when there is one; prose is the fallback, never an
    // override — a file that states its types is stating them for a reason.
    const kind = cols.kind === -1 ? described.kind : normaliseKind(cell(cols.kind) ?? "");
    if (kind === null) {
      rejected.push({
        line,
        reason:
          cols.kind === -1
            ? "Couldn't tell what this row is from its description."
            : `Unknown type "${cell(cols.kind) ?? ""}".`,
        raw,
      });
      return;
    }

    const amount = num(cell(cols.amount));
    if (amount === null) {
      rejected.push({ line, reason: "The amount couldn't be read.", raw });
      return;
    }

    const symbol = (cell(cols.symbol) ?? "").trim();
    const externalId = (cell(cols.externalId) ?? "").trim();
    const description = (cell(cols.description) ?? "").trim();

    events.push({
      date,
      kind,
      // Whatever the file gave, then whatever the sentence gave.
      symbol: symbol !== "" ? symbol : described.name,
      isin: normaliseIsin(cell(cols.isin)) ?? described.isin,
      quantity: num(cell(cols.quantity)) ?? described.quantity,
      price: num(cell(cols.price)),
      amount,
      fees: num(cell(cols.fees)),
      currency: (cell(cols.currency) ?? "EUR").trim() || "EUR",
      description: description === "" ? null : description,
      externalId: externalId === "" ? null : externalId,
      line,
    });
  });

  return { events, rejected };
}

/**
 * A key that identifies the same event however it reached us.
 *
 * The same dividend can arrive twice — once from the API sync and once from a
 * statement you import — and counting it twice overstates your income. The
 * platform's own id is used when there is one; otherwise date, kind, symbol
 * and amount together are specific enough, and a genuine duplicate on all four
 * is indistinguishable from the same payment anyway.
 */
export function naturalKey(e: {
  date: Date;
  kind: string;
  symbol?: string | null;
  isin?: string | null;
  amount: number;
  externalId?: string | null;
}): string {
  if (e.externalId) return `id:${e.externalId}`;
  const day = e.date.toISOString().slice(0, 10);
  // The ISIN is only a *fallback* for the symbol, never a replacement. Rows
  // already imported were keyed on the symbol alone; preferring the ISIN would
  // give every one of them a new key, and the next import of the same file
  // would duplicate the lot instead of doing nothing.
  const instrument = (e.symbol ?? e.isin ?? "").toUpperCase();
  return `${day}|${e.kind}|${instrument}|${e.amount.toFixed(2)}`;
}

/**
 * Matches a statement symbol to a platform ticker.
 *
 * Trading 212's export writes `IGLA` where its API says `IGLAI_EQ`. The
 * statement symbol is a prefix, so a unique prefix match is safe; an ambiguous
 * one returns null rather than picking the first, because attaching a dividend
 * to the wrong instrument is worse than leaving it unattached.
 */
export function matchTicker(symbol: string, tickers: readonly string[]): string | null {
  const upper = symbol.trim().toUpperCase();
  if (upper === "") return null;

  const exact = tickers.find((t) => t.toUpperCase() === upper);
  if (exact) return exact;

  const prefixed = tickers.filter((t) => t.toUpperCase().startsWith(upper));
  return prefixed.length === 1 ? prefixed[0] : null;
}

export interface CashFlowSummary {
  /** Money you put in. */
  deposits: number;
  /** Money you took out, as a positive number. */
  withdrawals: number;
  /** Deposits minus withdrawals: what you actually committed. */
  net: number;
  first: Date | null;
  last: Date | null;
}

/**
 * What you added and what you took back.
 *
 * Buys and sells are deliberately excluded: moving cash into a position isn't
 * money entering the account, it's the same money in another shape. Only
 * transfers across the account boundary count.
 */
export function summariseCashFlows(events: readonly BrokerEvent[]): CashFlowSummary {
  const flows = events.filter((e) => e.kind === "DEPOSIT" || e.kind === "WITHDRAWAL");

  const deposits = flows
    .filter((e) => e.kind === "DEPOSIT")
    .reduce((s, e) => s + Math.abs(e.amount), 0);
  const withdrawals = flows
    .filter((e) => e.kind === "WITHDRAWAL")
    .reduce((s, e) => s + Math.abs(e.amount), 0);

  const dates = flows.map((e) => e.date.getTime()).sort((a, b) => a - b);

  return {
    deposits: round2(deposits),
    withdrawals: round2(withdrawals),
    net: round2(deposits - withdrawals),
    first: dates.length > 0 ? new Date(dates[0]) : null,
    last: dates.length > 0 ? new Date(dates[dates.length - 1]) : null,
  };
}

export interface OpeningBalanceCheck {
  /** The most the running cash balance ever went below zero. */
  shortfall: number;
  /** True when the statement cannot be the account's whole history. */
  needsOpeningBalance: boolean;
  /** The least the account must have held before the first row. */
  impliedOpening: number;
}

/**
 * Does this statement start at the beginning?
 *
 * Runs the cash through the file in order. If the balance ever goes negative,
 * money was in the account before the first row — a broker does not let you
 * spend what you don't have — so treating the opening value as zero would
 * invent a gain out of the missing history.
 *
 * This account is the case in point: €260 deposited against €306 withdrawn.
 * Assuming it started empty would report a return that never happened.
 */
export function checkOpeningBalance(events: readonly BrokerEvent[]): OpeningBalanceCheck {
  const ordered = [...events].sort((a, b) => a.date.getTime() - b.date.getTime());

  let balance = 0;
  let lowest = 0;
  for (const e of ordered) {
    balance += e.amount - (e.fees ?? 0);
    if (balance < lowest) lowest = balance;
  }

  const impliedOpening = round2(Math.abs(Math.min(0, lowest)));
  return {
    shortfall: impliedOpening,
    needsOpeningBalance: impliedOpening > 0.005,
    impliedOpening,
  };
}

export interface GrowthBreakdown {
  /** What the account is worth now. */
  currentValue: number;
  /** Deposits minus withdrawals over the statement. */
  netContributed: number;
  /**
   * Value now minus what you put in. The only figure here that is *performance*
   * rather than arithmetic on your own transfers.
   */
  gain: number;
  /** Gain against what you committed, as a percentage. Null when you put in nothing. */
  returnPercent: number | null;
}

/**
 * How much of the balance you earned and how much you simply paid in.
 *
 * `openingValue` is what the account held before the statement's first entry —
 * zero for a full history, which is the usual case for an account opened this
 * year. Getting this wrong flatters or maligns the return, so it is a
 * parameter rather than an assumption.
 */
export function growthBreakdown(
  currentValue: number,
  flows: CashFlowSummary,
  openingValue = 0
): GrowthBreakdown {
  const netContributed = flows.net;
  const gain = round2(currentValue - openingValue - netContributed);
  const committed = openingValue + netContributed;

  return {
    currentValue: round2(currentValue),
    netContributed,
    gain,
    returnPercent: committed <= 0 ? null : round2((gain / committed) * 100),
  };
}

export interface HistoryPoint {
  date: string;
  /** Deposits minus withdrawals, cumulative. */
  contributed: number;
  /** Buys minus sells at the price paid, cumulative. Cost, not value. */
  investedAtCost: number;
  /** Dividends and interest received, cumulative. */
  incomeReceived: number;
  /** Fees paid, cumulative. */
  feesPaid: number;
}

/**
 * What the statement can honestly say about the past.
 *
 * Deliberately **not** portfolio value. A statement records what you paid and
 * what you received; it does not record what your holdings were worth on any
 * given day, and reconstructing that needs historical prices the file doesn't
 * contain. Drawing a value line from this would mean inventing the prices, and
 * the result would look authoritative while being fiction.
 *
 * What it does support is the money you committed, the cost of what you bought
 * and the income that arrived — three real lines, each measurable to the cent
 * from the file alone.
 */
export function cumulativeHistory(events: readonly BrokerEvent[]): HistoryPoint[] {
  const ordered = [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (ordered.length === 0) return [];

  let contributed = 0;
  let investedAtCost = 0;
  let incomeReceived = 0;
  let feesPaid = 0;

  const byDate = new Map<string, HistoryPoint>();

  for (const e of ordered) {
    const date = e.date.toISOString().slice(0, 10);

    switch (e.kind) {
      case "DEPOSIT":
        contributed += Math.abs(e.amount);
        break;
      case "WITHDRAWAL":
        contributed -= Math.abs(e.amount);
        break;
      case "BUY":
        investedAtCost += Math.abs(e.amount);
        break;
      case "SELL":
        // At the price paid, so a sale reduces cost rather than adding profit.
        // Profit belongs to realised P&L, which needs a cost-basis method.
        investedAtCost -= Math.abs(e.amount);
        break;
      case "DIVIDEND":
      case "INTEREST":
        incomeReceived += e.amount;
        break;
      case "FEE":
        feesPaid += Math.abs(e.amount);
        break;
    }

    feesPaid += e.fees ?? 0;

    byDate.set(date, {
      date,
      contributed: round2(contributed),
      investedAtCost: round2(investedAtCost),
      incomeReceived: round2(incomeReceived),
      feesPaid: round2(feesPaid),
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
