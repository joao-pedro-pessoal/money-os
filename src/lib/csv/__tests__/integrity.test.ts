import { describe, it, expect } from "vitest";
import { countDataRows, controlSums, reconcile, previousImportOf } from "../integrity";

describe("countDataRows", () => {
  it("excludes the header", () => {
    expect(countDataRows("date,amount\n2026-01-01,10\n2026-01-02,20")).toBe(2);
  });

  it("ignores trailing blank lines", () => {
    expect(countDataRows("date,amount\n2026-01-01,10\n\n\n")).toBe(1);
  });

  it("handles Windows line endings", () => {
    expect(countDataRows("date,amount\r\n2026-01-01,10\r\n2026-01-02,20\r\n")).toBe(2);
  });

  it("is zero for a header on its own", () => {
    expect(countDataRows("date,amount")).toBe(0);
  });

  it("is zero for an empty file", () => {
    expect(countDataRows("")).toBe(0);
  });
});

describe("controlSums", () => {
  it("keeps debits and credits apart", () => {
    const s = controlSums([-50, -25.5, 100, 3000]);
    expect(s.debits).toBe(75.5);
    expect(s.credits).toBe(3100);
    expect(s.net).toBe(3024.5);
    expect(s.count).toBe(4);
  });

  it("catches a compensating pair that the net would hide", () => {
    // Lose a +100 and a -100 and the net is unchanged while two rows vanished.
    const full = controlSums([100, -100, 50]);
    const lossy = controlSums([50]);
    expect(full.net).toBe(lossy.net);
    // The net agrees, so the net alone proves nothing. These do not.
    expect(full.debits).not.toBe(lossy.debits);
    expect(full.credits).not.toBe(lossy.credits);
    expect(full.count).not.toBe(lossy.count);
  });

  it("ignores unreadable values instead of poisoning the total", () => {
    const s = controlSums([100, NaN, Infinity, -40]);
    expect(s.credits).toBe(100);
    expect(s.debits).toBe(40);
    expect(s.count).toBe(2);
  });

  it("is all zeroes for nothing", () => {
    expect(controlSums([])).toEqual({ debits: 0, credits: 0, net: 0, count: 0 });
  });
});

describe("reconcile", () => {
  it("says nothing when everything adds up", () => {
    expect(reconcile({ rowsInFile: 10, rowsParsed: 10, duplicates: 0, invalid: 0 })).toEqual([]);
  });

  it("warns loudly about rows that went missing", () => {
    const out = reconcile({ rowsInFile: 50, rowsParsed: 47, duplicates: 0, invalid: 0 });
    expect(out[0].level).toBe("warn");
    expect(out[0].message).toContain("3 rows went missing");
  });

  it("warns about rows that appeared from nowhere", () => {
    const out = reconcile({ rowsInFile: 10, rowsParsed: 12, duplicates: 0, invalid: 0 });
    expect(out[0].level).toBe("warn");
    expect(out[0].message).toContain("added");
  });

  it("treats duplicates and unreadable rows as information, not alarm", () => {
    // Both are already visible in the preview; they are explained, not missing.
    const out = reconcile({ rowsInFile: 10, rowsParsed: 10, duplicates: 3, invalid: 1 });
    expect(out.every((d) => d.level === "info")).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("does not complain when the file row count is unknown", () => {
    const out = reconcile({ rowsInFile: 0, rowsParsed: 5, duplicates: 0, invalid: 0 });
    expect(out).toEqual([]);
  });

  it("uses singular wording for one row", () => {
    const out = reconcile({ rowsInFile: 10, rowsParsed: 9, duplicates: 0, invalid: 0 });
    expect(out[0].message).toContain("1 row went missing");
  });
});

describe("previousImportOf", () => {
  const history = [
    { fileHash: "abc", fileName: "jan.csv", createdAt: "2026-02-01" },
    { fileHash: null, fileName: "old.csv", createdAt: "2026-01-01" },
  ];

  it("recognises a file already imported", () => {
    expect(previousImportOf("abc", history)?.fileName).toBe("jan.csv");
  });

  it("returns null for a new file", () => {
    expect(previousImportOf("xyz", history)).toBeNull();
  });

  it("never matches an import that predates hashing", () => {
    // A null hash must not be treated as "the same as anything else null".
    expect(previousImportOf("", history)).toBeNull();
  });
});
