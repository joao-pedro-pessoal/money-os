import { describe, it, expect } from "vitest";
import { parseAmount, parseDate, detectColumns, buildRows, summarize, dedupKey } from "../index";

describe("parseAmount", () => {
  it("reads a plain number", () => {
    expect(parseAmount("12.50")).toBe(12.5);
    expect(parseAmount("1234")).toBe(1234);
  });

  it("reads the Portuguese convention where comma is decimal", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("12,50")).toBe(12.5);
    expect(parseAmount("0,99")).toBe(0.99);
  });

  it("reads the English convention where dot is decimal", () => {
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("12,345,678.90")).toBe(12345678.9);
  });

  it("treats a lone group of three as thousands, not decimals", () => {
    expect(parseAmount("1.234")).toBe(1234);
    expect(parseAmount("1,234")).toBe(1234);
  });

  it("still reads two decimals after a comma correctly", () => {
    expect(parseAmount("1,23")).toBe(1.23);
  });

  it("handles negatives however they're written", () => {
    expect(parseAmount("-12,50")).toBe(-12.5);
    expect(parseAmount("12,50-")).toBe(-12.5);
    expect(parseAmount("(12,50)")).toBe(-12.5);
  });

  it("strips currency symbols and spaces", () => {
    expect(parseAmount("€ 1.234,56")).toBe(1234.56);
    expect(parseAmount("1 234,56")).toBe(1234.56);
    expect(parseAmount("$12.50")).toBe(12.5);
  });

  it("returns null for anything it cannot read, rather than guessing", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("--")).toBeNull();
  });

  it("keeps the sign on a positive explicitly marked", () => {
    expect(parseAmount("+250,00")).toBe(250);
  });
});

describe("parseDate", () => {
  const iso = (d: Date | null) => d?.toISOString().slice(0, 10);

  it("reads ISO", () => {
    expect(iso(parseDate("2026-01-15"))).toBe("2026-01-15");
  });

  it("reads day-first European formats", () => {
    expect(iso(parseDate("15/01/2026"))).toBe("2026-01-15");
    expect(iso(parseDate("15-01-2026"))).toBe("2026-01-15");
    expect(iso(parseDate("15.01.2026"))).toBe("2026-01-15");
  });

  it("treats an ambiguous date as day-first, the European convention", () => {
    // 01/02/2026 is 1 February, not 2 January.
    expect(iso(parseDate("01/02/2026"))).toBe("2026-02-01");
  });

  it("reads two-digit years", () => {
    expect(iso(parseDate("15/01/26"))).toBe("2026-01-15");
    expect(iso(parseDate("15/01/99"))).toBe("1999-01-15");
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("45/13/2026")).toBeNull();
  });

  it("returns null for junk", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("detectColumns", () => {
  it("finds Portuguese headers", () => {
    const m = detectColumns(["Data", "Descrição", "Montante", "Saldo"]);
    expect(m.date).toBe("Data");
    expect(m.amount).toBe("Montante");
    expect(m.description).toBe("Descrição");
  });

  it("finds English headers", () => {
    const m = detectColumns(["Date", "Description", "Amount"]);
    expect(m.date).toBe("Date");
    expect(m.amount).toBe("Amount");
  });

  it("prefers an exact header over one that merely contains the word", () => {
    const m = detectColumns(["Data Valor", "Data", "Montante"]);
    expect(m.date).toBe("Data");
  });

  it("recognises a split debit/credit layout", () => {
    const m = detectColumns(["Date", "Details", "Debit", "Credit"]);
    expect(m.debit).toBe("Debit");
    expect(m.credit).toBe("Credit");
    expect(m.amount).toBeUndefined();
  });

  it("does not treat a lone credit column as a split layout", () => {
    const m = detectColumns(["Date", "Amount", "Credit Limit"]);
    expect(m.amount).toBe("Amount");
    expect(m.debit).toBeUndefined();
  });

  it("leaves the date blank when nothing looks like one", () => {
    expect(detectColumns(["foo", "bar"]).date).toBe("");
  });
});

describe("buildRows", () => {
  const mapping = { date: "Data", amount: "Montante", description: "Descrição" };

  it("maps a normal file", () => {
    const rows = buildRows(
      [{ Data: "15/01/2026", Montante: "-12,50", "Descrição": "Café" }],
      mapping
    );
    expect(rows[0].amount).toBe(-12.5);
    expect(rows[0].description).toBe("Café");
    expect(rows[0].problem).toBeNull();
  });

  it("flags rows it cannot read instead of importing rubbish", () => {
    const rows = buildRows(
      [
        { Data: "nope", Montante: "-12,50", "Descrição": "x" },
        { Data: "15/01/2026", Montante: "abc", "Descrição": "y" },
        { Data: "15/01/2026", Montante: "0", "Descrição": "z" },
      ],
      mapping
    );
    expect(rows[0].problem).toBe("Unreadable date");
    expect(rows[1].problem).toBe("Unreadable amount");
    expect(rows[2].problem).toBe("Zero amount");
  });

  it("makes debit negative and credit positive in a split layout", () => {
    const rows = buildRows(
      [
        { Date: "15/01/2026", Debit: "50,00", Credit: "" },
        { Date: "16/01/2026", Debit: "", Credit: "100,00" },
      ],
      { date: "Date", debit: "Debit", credit: "Credit" }
    );
    expect(rows[0].amount).toBe(-50);
    expect(rows[1].amount).toBe(100);
  });

  it("marks a row already in the account as duplicate", () => {
    const existing = new Set([dedupKey(new Date("2026-01-15"), -12.5, "Café")]);
    const rows = buildRows([{ Data: "15/01/2026", Montante: "-12,50", "Descrição": "Café" }], mapping, existing);
    expect(rows[0].duplicate).toBe(true);
  });

  it("marks a repeat within the same file as duplicate too", () => {
    const rows = buildRows(
      [
        { Data: "15/01/2026", Montante: "-12,50", "Descrição": "Café" },
        { Data: "15/01/2026", Montante: "-12,50", "Descrição": "Café" },
      ],
      mapping
    );
    expect(rows[0].duplicate).toBe(false);
    expect(rows[1].duplicate).toBe(true);
  });

  it("does not confuse two genuinely different transactions on the same day", () => {
    const rows = buildRows(
      [
        { Data: "15/01/2026", Montante: "-12,50", "Descrição": "Café" },
        { Data: "15/01/2026", Montante: "-12,50", "Descrição": "Almoço" },
      ],
      mapping
    );
    expect(rows[1].duplicate).toBe(false);
  });
});

describe("summarize", () => {
  it("counts what will and won't be imported, and the net", () => {
    const rows = buildRows(
      [
        { Data: "15/01/2026", Montante: "-12,50", "Descrição": "a" },
        { Data: "16/01/2026", Montante: "100,00", "Descrição": "b" },
        { Data: "15/01/2026", Montante: "-12,50", "Descrição": "a" }, // duplicate
        { Data: "bad", Montante: "1", "Descrição": "c" }, // invalid
      ],
      { date: "Data", amount: "Montante", description: "Descrição" }
    );
    const s = summarize(rows);
    expect(s.total).toBe(4);
    expect(s.importable).toBe(2);
    expect(s.duplicates).toBe(1);
    expect(s.invalid).toBe(1);
    expect(s.net).toBe(87.5);
  });
});
