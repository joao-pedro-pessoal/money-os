import { describe, it, expect } from "vitest";
import { validateBackup, toCsv, csvCell, BACKUP_TABLES, BACKUP_VERSION } from "../index";

function fullBackup(over: Record<string, unknown[]> = {}) {
  const data: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) data[t] = [];
  return { version: BACKUP_VERSION, exportedAt: "2026-08-08T00:00:00Z", data: { ...data, ...over } };
}

describe("validateBackup", () => {
  it("accepts a complete backup and counts the rows", () => {
    const r = validateBackup(fullBackup({ accounts: [{ id: "a" }, { id: "b" }] }));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.counts.accounts).toBe(2);
  });

  it("rejects something that isn't a backup", () => {
    expect(validateBackup("nope").ok).toBe(false);
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ foo: 1 }).ok).toBe(false);
  });

  it("rejects a backup from a newer version it cannot understand", () => {
    const r = validateBackup({ ...fullBackup(), version: BACKUP_VERSION + 1 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/newer/);
  });

  it("accepts an older backup missing newer tables, warning instead of failing", () => {
    const backup = fullBackup();
    delete (backup.data as Record<string, unknown>).playlists;
    const r = validateBackup(backup);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("playlists"))).toBe(true);
  });

  it("rejects a table that isn't a list", () => {
    const r = validateBackup(fullBackup({ accounts: "oops" as unknown as unknown[] }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/not a list/);
  });

  it("warns about tables it doesn't recognise instead of choking", () => {
    const backup = fullBackup();
    (backup.data as Record<string, unknown>).somethingElse = [];
    const r = validateBackup(backup);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.includes("somethingElse"))).toBe(true);
  });
});

describe("csvCell", () => {
  it("passes simple values through", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell(42)).toBe("42");
  });

  it("blanks null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes values containing commas, quotes or newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCsv", () => {
  it("writes a header and rows", () => {
    expect(toCsv([{ a: 1, b: 2 }])).toBe("a,b\n1,2\n");
  });

  it("uses the given column order", () => {
    expect(toCsv([{ a: 1, b: 2 }], ["b", "a"])).toBe("b,a\n2,1\n");
  });

  it("still writes a header when there are no rows", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b\n");
  });

  it("escapes a description containing a comma", () => {
    const csv = toCsv([{ description: "Coffee, milk", amount: -3 }]);
    expect(csv).toContain('"Coffee, milk"');
  });
});
