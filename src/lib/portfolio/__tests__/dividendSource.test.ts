import { describe, it, expect } from "vitest";
import {
  partitionDividends,
  nameByInstrument,
  type DividendRecord,
} from "../dividendSource";

const record = (over: Partial<DividendRecord> = {}): DividendRecord => ({
  accountId: "t212",
  accountName: "Trading 212",
  source: "connector",
  kind: "distribution",
  instrument: "EUN3d_EQ",
  name: null,
  paidOn: "2026-01-28",
  amount: 1.2,
  currency: "EUR",
  type: "ORDINARY",
  quantity: null,
  grossPerShare: null,
  ...over,
});

/**
 * The live account this was written for.
 *
 * Trading 212's three payments exist twice — once from the connector, once
 * from the CSV import — on identical dates, differing only in how the symbol
 * is spelled. Trade Republic's thirteen exist once, in a statement, and were
 * invisible because the page read the connector table alone.
 */
const T212_DATES = ["2026-01-28", "2026-06-30", "2026-07-29"];
const REAL: DividendRecord[] = [
  ...T212_DATES.map((paidOn) => record({ source: "connector", paidOn, instrument: "EUN3d_EQ" })),
  ...T212_DATES.map((paidOn) => record({ source: "import", paidOn, instrument: "EUN3" })),
  ...Array.from({ length: 13 }, (_, i) =>
    record({
      accountId: "tr",
      accountName: "Trade Republic",
      source: "statement",
      instrument: "CA25537R1091",
      paidOn: `2026-0${(i % 8) + 1}-10`,
    })
  ),
];

describe("three tables, one fact", () => {
  const split = partitionDividends(REAL);

  /**
   * The bug that started this: thirteen real payments sitting in a statement
   * while the page reported a total built from three.
   */
  it("counts the payments an account only has in a statement", () => {
    const tr = split.counted.filter((r) => r.accountName === "Trade Republic");
    expect(tr).toHaveLength(13);
  });

  /**
   * And the bug a naive fix would have introduced. Unioning the tables doubles
   * these three, because they are the same three payments written twice.
   */
  it("counts a payment held in two tables exactly once", () => {
    const t212 = split.counted.filter((r) => r.accountName === "Trading 212");
    expect(t212).toHaveLength(3);
    expect(t212.every((r) => r.source === "connector")).toBe(true);
  });

  it("totals sixteen, not three and not nineteen", () => {
    expect(split.counted).toHaveLength(16);
  });

  it("keeps the duplicates as cross-checks rather than discarding them", () => {
    expect(split.crossCheckOnly).toHaveLength(3);
    expect(split.crossCheckOnly.every((r) => r.source === "import")).toBe(true);
  });

  it("says which source won for each account, and what else was there", () => {
    // Sorted by account name: "Trade Republic" sorts before "Trading 212".
    expect(split.chosenBy).toEqual([
      {
        accountId: "tr",
        accountName: "Trade Republic",
        kind: "distribution",
        source: "statement",
        others: [],
      },
      {
        accountId: "t212",
        accountName: "Trading 212",
        kind: "distribution",
        source: "connector",
        others: ["import"],
      },
    ]);
  });
});

describe("choosing a source", () => {
  /**
   * A connector's answer is the venue's own statement of what it paid, and it
   * carries the quantity and gross per share neither import does.
   */
  it("prefers the connector, then the statement, then the import", () => {
    const all = partitionDividends([
      record({ source: "import" }),
      record({ source: "statement" }),
      record({ source: "connector" }),
    ]);
    expect(all.counted.map((r) => r.source)).toEqual(["connector"]);
    expect(all.crossCheckOnly.map((r) => r.source).sort()).toEqual(["import", "statement"]);
  });

  it("falls to the statement when there is no connector", () => {
    const split = partitionDividends([record({ source: "import" }), record({ source: "statement" })]);
    expect(split.counted.map((r) => r.source)).toEqual(["statement"]);
  });

  /**
   * Applied per account, never globally. An account whose only record is a
   * statement is fully served by it, and a global rule preferring connectors
   * would silence exactly the account this was written to fix.
   */
  it("decides per account, so one account's connector does not silence another", () => {
    const split = partitionDividends([
      record({ accountId: "a", accountName: "A", source: "connector" }),
      record({ accountId: "b", accountName: "B", source: "statement" }),
      record({ accountId: "b", accountName: "B", source: "statement", paidOn: "2026-02-02" }),
    ]);
    expect(split.counted).toHaveLength(3);
    expect(split.crossCheckOnly).toEqual([]);
  });

  /**
   * The case that forced the key to carry the kind. Trading 212's connector
   * reports dividends and no interest, while the import of the same account
   * reports both. Choosing one source for the whole account loses every
   * interest payment — one hole traded for another.
   */
  it("does not let a source that reports dividends silence one that reports interest", () => {
    const split = partitionDividends([
      record({ source: "connector", kind: "distribution" }),
      record({ source: "import", kind: "distribution" }),
      record({ source: "import", kind: "interest", type: "INTEREST" }),
      record({ source: "import", kind: "interest", type: "INTEREST", paidOn: "2026-02-02" }),
    ]);

    // The duplicated dividend resolves to the connector, and both interest
    // payments survive because nothing else reports any.
    expect(split.counted.filter((r) => r.kind === "distribution")).toHaveLength(1);
    expect(split.counted.filter((r) => r.kind === "interest")).toHaveLength(2);
    expect(split.crossCheckOnly).toHaveLength(1);
  });

  it("has nothing to partition when there is nothing", () => {
    expect(partitionDividends([])).toEqual({ counted: [], crossCheckOnly: [], chosenBy: [] });
  });

  it("returns the newest first, which is how the page reads them", () => {
    const split = partitionDividends([
      record({ paidOn: "2026-01-01" }),
      record({ paidOn: "2026-07-01" }),
      record({ paidOn: "2026-03-01" }),
    ]);
    expect(split.counted.map((r) => r.paidOn)).toEqual([
      "2026-07-01",
      "2026-03-01",
      "2026-01-01",
    ]);
  });
});

/**
 * A statement's dividend rows carry the ISIN and nothing else — "Cash Dividend
 * for ISIN CA67077M1086" — while its purchase rows name the same instrument.
 * Recovering the name from the user's own file is the only honest source for
 * it; the alternative is showing an ISIN, which is true, or inventing one,
 * which this codebase forbids.
 */
describe("recovering a name from the same file", () => {
  const STATEMENT = [
    { isin: "CA67077M1086", symbol: "NUTRIEN LTD" },
    { isin: "CA25537R1091", symbol: "DIVIDEND 15 SPLIT A CD 15" },
    { isin: "CA67077M1086", symbol: null },
    { isin: null, symbol: "SOMETHING" },
  ];

  it("names an instrument from the rows that do carry a name", () => {
    const names = nameByInstrument(STATEMENT);
    expect(names.get("CA67077M1086")).toBe("NUTRIEN LTD");
    expect(names.get("CA25537R1091")).toBe("DIVIDEND 15 SPLIT A CD 15");
  });

  it("has no name for an ISIN nothing names", () => {
    expect(nameByInstrument([{ isin: "XX0000000000", symbol: null }]).size).toBe(0);
  });

  it("ignores a row with no ISIN to hang the name on", () => {
    expect(nameByInstrument([{ isin: null, symbol: "ORPHAN" }]).size).toBe(0);
  });

  it("keeps the first name rather than letting a later row overwrite it", () => {
    const names = nameByInstrument([
      { isin: "A", symbol: "First" },
      { isin: "A", symbol: "Second" },
    ]);
    expect(names.get("A")).toBe("First");
  });

  it("does not treat an empty symbol as a name", () => {
    expect(nameByInstrument([{ isin: "A", symbol: "   " }]).size).toBe(0);
  });
});
