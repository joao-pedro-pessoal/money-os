import { describe, it, expect } from "vitest";
import {
  detectDelimiter,
  inspectBrokerCsv,
  parseBrokerCsv,
  looksLikeBrokerStatement,
  normaliseKind,
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
    expect(i.missingRequired).toEqual(["date", "type", "amount"]);
    expect(i.headers).toEqual(["Datum", "Buchungstext", "Betrag"]);
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
