import { describe, it, expect } from "vitest";
import {
  detectDelimiter,
  inspectBrokerCsv,
  parseBrokerCsv,
  looksLikeBrokerStatement,
  normaliseKind,
  directionFromQuantity,
} from "../broker";

/** A semicolon export with comma decimals — the continental European default. */
const EUROPEAN = [
  "Date;Type;ISIN;Symbol;Quantity;Price;Amount;Currency",
  "2026-01-15;Buy;IE00B4L5Y983;IWDA;2,5;100,40;-251,00;EUR",
  "2026-02-15;Buy;IE00B4L5Y983;IWDA;1,5;102,00;-153,00;EUR",
  "2026-03-01;Dividend;IE00B4L5Y983;IWDA;;;1,20;EUR",
].join("\n");

describe("finding the separator", () => {
  it("spots a semicolon file", () => {
    // The reason this exists: in most of Europe the comma is the decimal point,
    // so exports use semicolons. Read with a comma splitter, €1.234,56 splits
    // into two cells and the whole file is nonsense — which the importer then
    // blames on the file.
    expect(detectDelimiter("Date;Type;Amount")).toBe(";");
  });

  it("spots tabs", () => {
    expect(detectDelimiter("Date\tType\tAmount")).toBe("\t");
  });

  it("keeps the comma as the default", () => {
    expect(detectDelimiter("Date,Type,Amount")).toBe(",");
    // A single column: no separator to find, and guessing would be worse.
    expect(detectDelimiter("Date")).toBe(",");
  });

  it("is not fooled by commas inside the values of a semicolon file", () => {
    // The header is used precisely because it holds names, not numbers.
    expect(detectDelimiter("Date;Description;Amount")).toBe(";");
  });
});

describe("reading a European export end to end", () => {
  it("parses semicolons and comma decimals together", () => {
    const { events, rejected } = parseBrokerCsv(EUROPEAN);

    expect(rejected).toEqual([]);
    expect(events).toHaveLength(3);
    expect(events[0].quantity).toBe(2.5);
    expect(events[0].amount).toBe(-251);
    expect(events[0].isin).toBe("IE00B4L5Y983");
  });
});

describe("reporting on a file instead of failing on it", () => {
  it("says which columns it recognised", () => {
    const i = inspectBrokerCsv(EUROPEAN);

    expect(i.readable).toBe(true);
    expect(i.delimiter).toBe(";");
    expect(i.rowCount).toBe(3);
    expect(i.columns.find((c) => c.role === "isin")?.header).toBe("ISIN");
    expect(i.columns.find((c) => c.role === "fees")?.header).toBeNull();
  });

  it("names the missing columns rather than shrugging", () => {
    // A broker the app has never met is the normal case, not an error. The
    // useful answer is which names to teach it.
    const i = inspectBrokerCsv("Datum;Buchungstext;Betrag\n2026-01-15;Kauf;-251,00");

    expect(i.readable).toBe(false);
    /**
     * `Datum` and `Betrag` are recognised now that the column names are
     * translated, which is right — they genuinely are a date and an amount.
     * What still refuses the file is the one column that decides what a row
     * *is*, and without it nothing can be imported.
     */
    expect(i.missingRequired).toEqual(["type"]);
    expect(i.headers).toEqual(["Datum", "Buchungstext", "Betrag"]);
  });

  /**
   * The mirror of the expensive bug: a Trade Republic export was once accepted
   * by the bank importer and 219 trades were filed as ordinary expenses.
   * Translating the column names must not start sending bank statements the
   * other way, so this pins the routing guard on bank-shaped headers.
   */
  it("still does not mistake a bank statement for a broker one", () => {
    expect(looksLikeBrokerStatement(["Datum", "Buchungstext", "Betrag", "Waehrung"])).toBe(false);
    expect(looksLikeBrokerStatement(["Data", "Descricao", "Valor", "Saldo"])).toBe(false);
  });

  /**
   * And the case the translation exists for: Degiro writes its headers in the
   * language of the account, so a Portuguese export has to be read as trades.
   */
  it("recognises a broker export whose headers are not in English", () => {
    expect(looksLikeBrokerStatement(["Data", "Produto", "Quantidade", "Preco", "Total"])).toBe(true);
    expect(looksLikeBrokerStatement(["Datum", "Product", "Aantal", "Koers"])).toBe(true);
  });

  it("lists the type words it doesn't know, commonest first", () => {
    const i = inspectBrokerCsv(
      [
        "Date,Type,Amount",
        "2026-01-01,Savings plan execution,-50",
        "2026-02-01,Savings plan execution,-50",
        "2026-03-01,Card refund,12",
        "2026-04-01,Buy,-100",
      ].join("\n")
    );

    expect(i.readable).toBe(true);
    expect(i.unknownKinds).toEqual([
      { word: "Savings plan execution", rows: 2 },
      { word: "Card refund", rows: 1 },
    ]);
  });

  it("has nothing to complain about in a file it fully understands", () => {
    expect(inspectBrokerCsv(EUROPEAN).unknownKinds).toEqual([]);
  });

  it("recognises a bank statement brought to the wrong importer", () => {
    // What actually happened the first time this shipped: a bank export was
    // pressed into the broker form and the page threw a 500, holding every
    // piece of information needed to say "wrong form" politely.
    const i = inspectBrokerCsv("date,amount,description,merchant,category\n2026-01-15,-12.40,Coffee,Nero,Food");

    expect(i.readable).toBe(false);
    expect(i.looksLikeBankStatement).toBe(true);
  });

  it("doesn't mistake a real broker export for a bank one", () => {
    expect(inspectBrokerCsv(EUROPEAN).looksLikeBankStatement).toBe(false);
  });

  it("survives an empty file", () => {
    const i = inspectBrokerCsv("");

    expect(i.readable).toBe(false);
    expect(i.rowCount).toBe(0);
    expect(i.headers).toEqual([]);
  });

  it("shows a sample row keyed by the file's own headers", () => {
    const [first] = inspectBrokerCsv(EUROPEAN).sample;

    expect(first["Symbol"]).toBe("IWDA");
    expect(first["Amount"]).toBe("-251,00");
  });
});

describe("type words that aren't English", () => {
  it("folds accents instead of deleting them", () => {
    // "Depósito" became DEPSITO and "Gebühr" became GEBHR, so no accented word
    // could ever match. Every European broker exporting in its own language hit
    // this, and it looked like an unrecognised type rather than a mangled one.
    expect(normaliseKind("Depósito")).toBe("DEPOSIT");
    expect(normaliseKind("Gebühr")).toBe("FEE");
    expect(normaliseKind("Comissão")).toBe("FEE");
    expect(normaliseKind("Intérêts")).toBe("INTEREST");
  });

  it("reads the words European brokers actually print", () => {
    expect(normaliseKind("Kauf")).toBe("BUY");
    expect(normaliseKind("Verkauf")).toBe("SELL");
    expect(normaliseKind("Dividende")).toBe("DIVIDEND");
    expect(normaliseKind("Zinsen")).toBe("INTEREST");
    expect(normaliseKind("Compra")).toBe("BUY");
    expect(normaliseKind("Venda")).toBe("SELL");
    expect(normaliseKind("Juros")).toBe("INTEREST");
    expect(normaliseKind("Levantamento")).toBe("WITHDRAWAL");
  });

  it("still refuses a word it has never seen", () => {
    // The report names it so it can be added deliberately, with the file in
    // front of us. Guessing here is how a fee becomes a purchase.
    expect(normaliseKind("Sparplanausführung")).toBeNull();
    expect(normaliseKind("")).toBeNull();
  });

  it("reads an accented column name", () => {
    const i = inspectBrokerCsv("Data;Tipo;Descrição;Quantidade;Montante\n2026-01-15;Compra;x;2;-100");
    // "Descrição" folded to "descricao", which is in the alias list; before the
    // fix it folded to "descrio" and matched nothing.
    expect(i.columns.find((c) => c.role === "description")?.header).toBe("Descrição");
  });
});

describe("recognising a broker export in the bank importer", () => {
  it("takes an ISIN column as decisive", () => {
    // What actually happened: a Trade Republic export went through the bank
    // importer, 219 buys and dividends were filed as expenses and income, the
    // import reported success, and the portfolio stayed empty.
    expect(looksLikeBrokerStatement(["Date", "Type", "ISIN", "Amount"])).toBe(true);
    expect(looksLikeBrokerStatement(["date", "isin code", "amount"])).toBe(true);
  });

  it("needs two hints when there is no ISIN", () => {
    // One column on its own is not enough: some bank exports carry a
    // "quantity", and crying wolf on every upload would train you to ignore it.
    expect(looksLikeBrokerStatement(["Date", "Quantity", "Amount"])).toBe(false);
    expect(looksLikeBrokerStatement(["Date", "Symbol", "Quantity", "Amount"])).toBe(true);
    expect(looksLikeBrokerStatement(["Date", "Ticker", "Price", "Amount"])).toBe(true);
  });

  it("leaves an ordinary bank statement alone", () => {
    expect(
      looksLikeBrokerStatement(["date", "amount", "description", "merchant", "category"])
    ).toBe(false);
    expect(looksLikeBrokerStatement([])).toBe(false);
  });
});

describe("the error, when there has to be one", () => {
  it("says which column is missing and what the file actually had", () => {
    // "Expected columns for date, type and amount" gave no clue which of the
    // three was the problem, on a file with twenty columns.
    expect(() => parseBrokerCsv("Datum;Buchungstext;Betrag\n2026-01-15;Kauf;-251,00")).toThrow(
      /Datum, Buchungstext, Betrag/
    );
  });
});

/**
 * Brokers whose exports the app could not read, and why.
 *
 * These fixtures are written from the documented shapes of each export, not
 * from files anyone has run through the app — so they prove the importer
 * handles the *shape*, and a real file is still the thing that would find a
 * detail nobody thought of. Every connector bug in this project was found that
 * way, and this is the same kind of guess in a different place.
 */
describe("exports that used to be refused", () => {
  /**
   * Revolut writes its order types with the order style attached and a hyphen
   * in the middle. `foldToLetters` strips the punctuation, so "BUY - MARKET"
   * arrives as BUYMARKET while the table only knew MARKETBUY — the same word
   * in the other order, and the file was refused over it.
   */
  it("reads Revolut's order types, whichever order the words are in", () => {
    expect(normaliseKind("BUY - MARKET")).toBe("BUY");
    expect(normaliseKind("SELL - LIMIT")).toBe("SELL");
    expect(normaliseKind("CASH TOP-UP")).toBe("DEPOSIT");
    expect(normaliseKind("CUSTODY FEE")).toBe("FEE");
    // And the order it already knew still works.
    expect(normaliseKind("Market buy")).toBe("BUY");
  });

  it("still refuses a word it has genuinely never seen", () => {
    expect(normaliseKind("STOCK SPLIT")).toBeNull();
    expect(normaliseKind("Savings plan execution")).toBeNull();
  });

  /**
   * Degiro's transactions export, in the shape a Portuguese account gets it:
   * semicolon-separated, headers in Portuguese, and **no type column at all**.
   * A purchase is a positive quantity and a sale a negative one.
   */
  const DEGIRO_PT = [
    "Data;Produto;ISIN;Quantidade;Preco;Total;Custos de transacao;Moeda",
    "2026-03-02;VANGUARD FTSE AW;IE00B3RBWM25;12;108,50;-1302,00;-1,00;EUR",
    "2026-04-11;VANGUARD FTSE AW;IE00B3RBWM25;-5;112,20;561,00;-1,00;EUR",
  ].join("\n");

  it("recognises it as trades rather than spending", () => {
    expect(looksLikeBrokerStatement(["Data", "Produto", "ISIN", "Quantidade", "Preco"])).toBe(true);
  });

  it("reads it, and says the types come from the sign of the quantity", () => {
    const i = inspectBrokerCsv(DEGIRO_PT);

    expect(i.readable).toBe(true);
    expect(i.delimiter).toBe(";");
    expect(i.missingRequired).toEqual([]);
    expect(i.signedQuantityRows).toBe(2);
    expect(i.columns.find((c) => c.role === "isin")?.header).toBe("ISIN");
    expect(i.columns.find((c) => c.role === "quantity")?.header).toBe("Quantidade");
    expect(i.columns.find((c) => c.role === "type")?.header).toBeNull();
  });

  it("turns the sign into a buy and a sell", () => {
    const { events, rejected } = parseBrokerCsv(DEGIRO_PT);

    expect(rejected).toEqual([]);
    expect(events.map((e) => e.kind)).toEqual(["BUY", "SELL"]);
    expect(events[0].quantity).toBe(12);
    expect(events[1].quantity).toBe(-5);
    expect(events[0].isin).toBe("IE00B3RBWM25");
  });

  /**
   * The inference is only about direction. A deposit or a fee has no quantity,
   * so it cannot be typed this way — and must be reported as unreadable rather
   * than filed as a purchase of nothing.
   */
  it("refuses a row it cannot type instead of guessing at it", () => {
    const withCash = [
      "Data;Produto;ISIN;Quantidade;Preco;Total;Moeda",
      "2026-03-02;VANGUARD FTSE AW;IE00B3RBWM25;12;108,50;-1302,00;EUR",
      "2026-03-01;Deposito;;;;1500,00;EUR",
    ].join("\n");

    const { events, rejected } = parseBrokerCsv(withCash);
    expect(events.map((e) => e.kind)).toEqual(["BUY"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/quantity/);
  });

  /**
   * The guard that stops this from spreading. Without an ISIN column the file
   * has nothing marking it as a trade export, and inferring purchases from a
   * quantity column on some bank's statement is exactly the mistake the
   * routing guard exists to prevent.
   */
  it("does not infer types on a file with no ISIN column", () => {
    const noIsin = [
      "Data;Produto;Quantidade;Total",
      "2026-03-02;Something;12;-1302,00",
    ].join("\n");

    const i = inspectBrokerCsv(noIsin);
    expect(i.signedQuantityRows).toBe(0);
    expect(i.readable).toBe(false);
    expect(i.missingRequired).toEqual(["type"]);
  });

  /**
   * A quantity of zero is not a direction, and neither is an absent one.
   */
  it("has no direction to read from a zero or missing quantity", () => {
    expect(directionFromQuantity(12)).toBe("BUY");
    expect(directionFromQuantity(-5)).toBe("SELL");
    expect(directionFromQuantity(0)).toBeNull();
    expect(directionFromQuantity(null)).toBeNull();
    expect(directionFromQuantity(Number.NaN)).toBeNull();
  });

  /**
   * A stated type always wins. A file that says what its rows are is saying so
   * for a reason, and a sale booked with a positive quantity — which some
   * brokers do, putting the direction in the type word instead — must not be
   * overridden into a purchase.
   */
  it("never lets the sign override a type the file states", () => {
    const stated = [
      "Date;Type;ISIN;Quantity;Amount",
      "2026-03-02;Sell;IE00B3RBWM25;5;561,00",
    ].join("\n");

    const { events } = parseBrokerCsv(stated);
    expect(events[0].kind).toBe("SELL");
    expect(events[0].quantity).toBe(5);
  });
});

/**
 * The report and the parser must agree about which columns exist.
 *
 * `parseBrokerCsv` used to repeat all eleven column-name lists inline instead
 * of reading `COLUMN_ROLES`. They agreed until they didn't: translating the
 * headers for Degiro updated one list, so `inspectBrokerCsv` called a
 * Portuguese file readable and `parseBrokerCsv` threw "no column for date,
 * type" on the very same file — the report promising something the importer
 * then refused.
 *
 * Two lists of the same thing agree right up until one is edited, which is why
 * there is now one and why this checks it stays that way.
 */
describe("the report and the parser read the same file the same way", () => {
  const files = [
    EUROPEAN,
    "Data;Produto;ISIN;Quantidade;Preco;Total;Moeda\n2026-03-02;VWCE;IE00B3RBWM25;12;108,50;-1302,00;EUR",
    "Datum;Product;ISIN;Aantal;Koers;Totaal\n2026-03-02;VWCE;IE00B3RBWM25;-5;112,20;561,00",
    "Date,Type,Amount,ISIN\n2026-01-01,Buy,-100,IE00B4L5Y983",
    "Fecha;Tipo;Importe;ISIN\n2026-01-01;Compra;-100;IE00B4L5Y983",
  ];

  it("never promises a file the parser then refuses", () => {
    for (const file of files) {
      const inspection = inspectBrokerCsv(file);
      if (!inspection.readable) continue;

      // Readable means parseBrokerCsv must not throw on it.
      expect(() => parseBrokerCsv(file), file.split("\n")[0]).not.toThrow();
    }
  });

  it("agrees on the delimiter, which decides everything after it", () => {
    for (const file of files) {
      const inspection = inspectBrokerCsv(file);
      // Same detector, same header line — pinned because a disagreement here
      // makes every column index wrong in one of the two.
      expect(inspection.delimiter, file.split("\n")[0]).toBe(detectDelimiter(file.split("\n")[0]));
    }
  });
});
