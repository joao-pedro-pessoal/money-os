import { describe, it, expect } from "vitest";
import {
  buildConversionPrompt,
  checkCanonicalHeader,
  CANONICAL_HEADER,
  CANONICAL_EXAMPLE,
} from "../prompt";
import { detectColumns, buildRows, summarize } from "../index";
import Papa from "papaparse";

describe("buildConversionPrompt", () => {
  const prompt = buildConversionPrompt();

  it("states the exact header the importer expects", () => {
    expect(prompt).toContain(CANONICAL_HEADER);
  });

  it("forbids the three things that silently corrupt an import", () => {
    // A thousands separator turns 1.234,56 into 1.23; a fence breaks the header
    // row; an unsigned amount loses the direction of the money.
    expect(prompt).toMatch(/NO thousands\s+separator/);
    expect(prompt).toMatch(/no markdown code fences/i);
    expect(prompt).toMatch(/Negative for money leaving/);
  });

  it("forbids inventing or altering transactions", () => {
    // A fabricated row in a ledger is worse than a missing one.
    expect(prompt).toMatch(/Do NOT add, merge, split, round/);
    expect(prompt).toMatch(/leave the row out entirely rather than guessing/);
  });

  it("lists known categories so the AI reuses them instead of inventing", () => {
    const withCategories = buildConversionPrompt({ categories: ["Food", "Housing", "Salary"] });
    expect(withCategories).toContain("Food, Housing, Salary");
    expect(withCategories).toMatch(/Do not invent new ones/);
  });

  it("tells it to leave category empty when the app has none", () => {
    expect(prompt).toMatch(/category: leave empty/);
  });

  it("names the currency and forbids converting", () => {
    expect(buildConversionPrompt({ currency: "USD" })).toMatch(/Currency is USD; do not convert/);
  });
});

describe("the canonical format round-trips through the importer", () => {
  it("is detected without the user mapping anything", () => {
    const parsed = Papa.parse<Record<string, string>>(CANONICAL_EXAMPLE, {
      header: true,
      skipEmptyLines: true,
    });
    const mapping = detectColumns(parsed.meta.fields ?? []);

    expect(mapping.date).toBe("date");
    expect(mapping.amount).toBe("amount");
    expect(mapping.description).toBe("description");
    expect(mapping.merchant).toBe("merchant");
  });

  it("parses every row of the example correctly", () => {
    const parsed = Papa.parse<Record<string, string>>(CANONICAL_EXAMPLE, {
      header: true,
      skipEmptyLines: true,
    });
    const rows = buildRows(parsed.data, detectColumns(parsed.meta.fields ?? []));
    const stats = summarize(rows);

    expect(stats.total).toBe(3);
    expect(stats.importable).toBe(3);
    expect(stats.invalid).toBe(0);
    // -12.50 - 750.00 + 2000.00
    expect(stats.net).toBe(1237.5);
  });

  it("keeps a description containing a comma intact", () => {
    const csv = `${CANONICAL_HEADER}\n2026-01-15,-12.50,"Coffee, milk and bread",Shop,Food`;
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    const rows = buildRows(parsed.data, detectColumns(parsed.meta.fields ?? []));

    expect(rows[0].description).toBe("Coffee, milk and bread");
    expect(rows[0].amount).toBe(-12.5);
  });
});

describe("checkCanonicalHeader", () => {
  it("accepts the canonical header", () => {
    expect(checkCanonicalHeader(CANONICAL_HEADER).ok).toBe(true);
  });

  it("accepts extra columns, as long as the required ones are there", () => {
    expect(checkCanonicalHeader("date,amount,description,balance").ok).toBe(true);
  });

  it("catches the markdown fence an AI leaves behind", () => {
    // The single most common failure when copying an AI's answer.
    const result = checkCanonicalHeader("```csv");
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/markdown code fence/);
  });

  it("says which columns are missing rather than just failing", () => {
    const result = checkCanonicalHeader("data,valor,descricao");
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/date, amount, description/);
  });

  it("tolerates spacing, casing and quoted headers", () => {
    expect(checkCanonicalHeader(' "Date", AMOUNT , description ').ok).toBe(true);
  });

  it("rejects prose returned instead of CSV", () => {
    expect(checkCanonicalHeader("Here is your converted statement:").ok).toBe(false);
  });
});
