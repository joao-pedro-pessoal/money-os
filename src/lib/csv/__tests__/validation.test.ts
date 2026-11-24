import { describe, expect, it } from "vitest";
import { bankFileRows, boundedCsv, centsText, importCents, validateImportRows, validateIntegrity, validateMapping } from "../validation";
import { boundedJson } from "@/lib/backup/limits";

const row = { date: "2026-11-01", amount: -10.25, description: "Synthetic" };
const mapping = JSON.stringify({ date: "Date", amount: "Amount", description: "Description" });

describe("bounded bank input before any database work", () => {
  it("parses quoted newlines and a semicolon delimiter without splitting a record", () => {
    const file = bankFileRows('Date;Amount;Description\r\n2026-11-01;-1,25;"Two\nlines"\r\n', mapping, 1000, 1);
    expect(file.rows).toEqual([{ date: "2026-11-01T00:00:00.000Z", amount: -1.25, description: "Two\nlines", merchant: "" }]);
    expect(file.rowsInFile).toBe(1);
  });
  it("measures UTF-8 bytes, independently of the character count", () => {
    expect(() => boundedCsv("ééé", 5, 1)).toThrow(/size/);
  });
  it.each(["Date,Amount\n2026-11-01,-1\n2026-11-02,-2\n", "Date,Amount\n" + '"unfinished'])('refuses excess rows or unfinished quotes: %s', text => {
    expect(() => boundedCsv(text, 1000, 1)).toThrow();
  });
  it("refuses 101 columns before mapping", () => {
    expect(() => boundedCsv(Array.from({ length: 101 }, (_, i) => `column${i}`).join(",") + "\n", 10000, 10)).toThrow(/columns/);
  });
  it("refuses oversized fields, malformed records and unknown mapping fields", () => {
    expect(() => boundedCsv(`A,B\n${"x".repeat(20001)},1`, 100000, 10)).toThrow(/field/);
    expect(() => boundedCsv("A,B\n1,2,3", 1000, 10)).toThrow(/columns/);
    expect(() => validateMapping('{"userId":"someone"}')).toThrow();
    expect(() => validateMapping("[]")).toThrow();
  });
  it.each([null, {}, [{ ...row, date: "2026-02-31" }], [{ ...row, amount: NaN }], [{ ...row, amount: Infinity }], [{ ...row, amount: 0.001 }], [{ ...row, amount: 0 }], [{ ...row, description: {} }]])("rejects invalid typed rows: %j", rows => {
    expect(() => validateImportRows(rows, 10)).toThrow();
  });
  it("checks all rows including the final row before returning any", () => {
    expect(() => validateImportRows([row, { ...row, merchant: "\0" }], 10)).toThrow();
    expect(() => validateImportRows([row, row], 1)).toThrow();
  });
  it("keeps exact cents instead of adding binary floating point amounts", () => {
    expect(centsText(importCents(0.1) + importCents(0.2))).toBe("0.30");
    expect(centsText(importCents(-999999999999.99))).toBe("-999999999999.99");
  });
  it("keeps the file's control sums before removing duplicate rows", () => {
    const text = "Date,Amount,Description\n2026-11-01,-10,Synthetic\n2026-11-01,-10,Synthetic\n";
    expect(bankFileRows(text, mapping, 1000, 10)).toMatchObject({ rowsInFile: 2, duplicates: 1, control: { debits: 20, credits: 0 } });
  });
  it("validates the claimed fingerprint and counts as untrusted metadata", () => {
    expect(() => validateIntegrity({ fileHash: "x", rowsInFile: 1 }, 10)).toThrow();
    expect(() => validateIntegrity({ fileHash: "a".repeat(64), rowsInFile: 11, debitTotal: 1, creditTotal: 0 }, 10)).toThrow();
  });
  it("bounds JSON depth before parsing, while ignoring brackets inside strings", () => {
    expect(boundedJson('{"text":"[[[\\\""}', 100)).toEqual({ text: '[[["' });
    expect(() => boundedJson("[".repeat(33) + "0" + "]".repeat(33), 1000)).toThrow(/deep/);
    expect(() => boundedJson('"éé"', 5)).toThrow(/limit/);
  });
});
