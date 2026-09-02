import { describe, it, expect } from "vitest";
import {
  applyTradeFilters,
  tradeFilterOptions,
  hasActiveTradeFilters,
  describeTradeFilters,
  NO_TRADE_FILTERS,
  type TradeHistoryRow,
} from "../filter";
import { bySymbol, cumulativePnl, byDirection, isTrade } from "../stats";

const row = (over: Partial<TradeHistoryRow> = {}): TradeHistoryRow => ({
  date: "2026-03-02T10:00:00.000Z",
  type: "SELL",
  symbol: "BTC",
  quantity: 1,
  amount: 100,
  fees: -1,
  realizedPnl: 20,
  description: "Close Long",
  accountName: "Hyperliquid",
  currency: "USD",
  ...over,
});

const HISTORY: TradeHistoryRow[] = [
  row({ date: "2026-01-10T09:00:00.000Z", symbol: "BTC", realizedPnl: 30, description: "Close Long" }),
  row({ date: "2026-02-14T09:00:00.000Z", symbol: "ETH", realizedPnl: -10, description: "Close Short" }),
  row({ date: "2026-03-02T09:00:00.000Z", symbol: "BTC", realizedPnl: -5, description: "Close Long" }),
  row({
    date: "2026-03-20T09:00:00.000Z",
    symbol: "SOL",
    type: "DIVIDEND",
    realizedPnl: null,
    description: null,
    accountName: "Kraken",
  }),
];

describe("narrowing the history", () => {
  it("lets everything through when nothing is set", () => {
    expect(applyTradeFilters(HISTORY, NO_TRADE_FILTERS)).toHaveLength(4);
  });

  it("filters by instrument", () => {
    const rows = applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, symbol: "BTC" });
    expect(rows.map((r) => r.symbol)).toEqual(["BTC", "BTC"]);
  });

  it("filters by event type, whatever case it was given in", () => {
    expect(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, type: "dividend" })).toHaveLength(1);
    expect(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, type: "SELL" })).toHaveLength(3);
  });

  it("filters by account", () => {
    expect(
      applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, accountName: "Kraken" })
    ).toHaveLength(1);
  });

  /**
   * Direction comes from the venue's own wording, and anything unrecognised is
   * `unknown` rather than assumed long — so filtering to "long" must not sweep
   * up a row nobody could classify.
   */
  it("filters by direction without assuming the unclassified are long", () => {
    expect(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, direction: "long" })).toHaveLength(2);
    expect(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, direction: "short" })).toHaveLength(1);
    expect(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, direction: "unknown" })).toHaveLength(1);
  });

  it("filters by a date range, both ends inclusive", () => {
    const rows = applyTradeFilters(HISTORY, {
      ...NO_TRADE_FILTERS,
      from: "2026-02-14",
      to: "2026-03-02",
    });
    expect(rows.map((r) => r.symbol)).toEqual(["ETH", "BTC"]);
  });

  it("includes a row dated exactly on either boundary", () => {
    expect(
      applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, from: "2026-01-10", to: "2026-01-10" })
    ).toHaveLength(1);
  });

  /**
   * Compared as ISO day strings, never as Date objects. A `Date` comparison
   * puts a row on the wrong side of a boundary for anyone not on UTC, and the
   * error is seasonal — invisible for months at a time.
   */
  it("puts a late-evening trade on its own calendar day", () => {
    const late = [row({ date: "2026-03-02T23:30:00.000Z", symbol: "LATE" })];
    expect(applyTradeFilters(late, { ...NO_TRADE_FILTERS, to: "2026-03-02" })).toHaveLength(1);
    expect(applyTradeFilters(late, { ...NO_TRADE_FILTERS, from: "2026-03-03" })).toHaveLength(0);
  });

  it("combines filters, narrowing rather than widening", () => {
    const rows = applyTradeFilters(HISTORY, {
      ...NO_TRADE_FILTERS,
      symbol: "BTC",
      direction: "long",
      from: "2026-02-01",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].realizedPnl).toBe(-5);
  });
});

/**
 * The reason this module exists rather than a hidden-rows toggle in the table.
 *
 * Every figure recomputes against what is left, because the statistics are
 * pure functions over the same array. Filtering to one instrument and still
 * showing the account's win rate would be two answers to one question.
 */
describe("the figures describe what is left, not the whole account", () => {
  it("recomputes realised P&L over the filtered set", () => {
    const all = bySymbol(applyTradeFilters(HISTORY, NO_TRADE_FILTERS));
    const btcOnly = bySymbol(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, symbol: "BTC" }));

    expect(all.map((s) => s.symbol).sort()).toEqual(["BTC", "ETH"]);
    expect(btcOnly.map((s) => s.symbol)).toEqual(["BTC"]);
    // 30 and −5: the same two rows the table would be showing.
    expect(btcOnly[0].realized).toBeCloseTo(25, 6);
  });

  it("recomputes the win rate, which is the figure most likely to mislead", () => {
    const long = byDirection(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, direction: "long" }));
    expect(long).toHaveLength(1);
    expect(long[0].direction).toBe("long");
    // One win out of two closed longs.
    expect(long[0].winRate).toBeCloseTo(50, 6);
  });

  it("recomputes the curve, so it starts where the filter starts", () => {
    const curve = cumulativePnl(
      applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, from: "2026-02-01" })
    );
    expect(curve[0].date).toBe("2026-02-14");
  });

  it("leaves nothing on screen when the filter matches nothing", () => {
    const rows = applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, symbol: "NOTHELD" });
    expect(rows).toEqual([]);
    expect(bySymbol(rows)).toEqual([]);
    expect(cumulativePnl(rows)).toEqual([]);
  });
});

describe("what there is to filter by", () => {
  const options = tradeFilterOptions(HISTORY);

  /**
   * Taken from the data, not from a list. A hard-coded set would offer
   * instruments nobody holds and miss the one imported this morning.
   */
  it("offers only values that are present in at least one row", () => {
    expect(options.symbols).toEqual(["BTC", "ETH", "SOL"]);
    expect(options.types).toEqual(["DIVIDEND", "SELL"]);
    expect(options.accounts).toEqual(["Hyperliquid", "Kraken"]);
  });

  it("never offers an option that would empty the table", () => {
    for (const symbol of options.symbols) {
      expect(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, symbol }).length).toBeGreaterThan(0);
    }
    for (const type of options.types) {
      expect(applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, type }).length).toBeGreaterThan(0);
    }
    for (const direction of options.directions) {
      expect(
        applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, direction }).length
      ).toBeGreaterThan(0);
    }
  });

  /** Meaningful order, not alphabetical, which would bury "short" after "long". */
  it("orders directions the way they mean something", () => {
    expect(options.directions).toEqual(["long", "short", "unknown"]);
  });

  it("reports the span the data covers, for bounding the date inputs", () => {
    expect(options.earliest).toBe("2026-01-10");
    expect(options.latest).toBe("2026-03-20");
  });

  it("has nothing to offer for an empty history", () => {
    const empty = tradeFilterOptions([]);
    expect(empty.symbols).toEqual([]);
    expect(empty.earliest).toBeNull();
  });
});

describe("saying what the filters are doing", () => {
  it("is null when nothing is narrowed", () => {
    expect(hasActiveTradeFilters(NO_TRADE_FILTERS)).toBe(false);
    expect(describeTradeFilters(NO_TRADE_FILTERS)).toBeNull();
  });

  /**
   * A figure computed over a subset has to say which subset, or it reads as
   * the whole account's.
   */
  it("describes the slice a total is about", () => {
    expect(
      describeTradeFilters({
        ...NO_TRADE_FILTERS,
        symbol: "BTC",
        direction: "long",
        accountName: "Kraken",
      })
    ).toBe("BTC · long · on Kraken");
  });

  it("words an open-ended range as open-ended", () => {
    expect(describeTradeFilters({ ...NO_TRADE_FILTERS, from: "2026-01-01" })).toBe(
      "from 2026-01-01"
    );
    expect(describeTradeFilters({ ...NO_TRADE_FILTERS, to: "2026-01-01" })).toBe("up to 2026-01-01");
    expect(
      describeTradeFilters({ ...NO_TRADE_FILTERS, from: "2026-01-01", to: "2026-02-01" })
    ).toBe("2026-01-01 to 2026-02-01");
  });

  it("knows a single filter counts as active", () => {
    expect(hasActiveTradeFilters({ ...NO_TRADE_FILTERS, symbol: "BTC" })).toBe(true);
  });
});

/**
 * Two shapes of "nothing to see", found by running the filters over the real
 * 200-event history rather than over the fixtures above.
 *
 * They look identical on screen and mean different things, which is this
 * codebase's oldest rule pointed at a chart instead of at a number.
 */
describe("empty in two different ways", () => {
  it("distinguishes no matching rows from rows that closed nothing", () => {
    // Both filters have events of their own; the combination has none. On the
    // real history "BTC · long" is exactly this: BTC has six events and long
    // has fifty-two, and they share none.
    const noRows = applyTradeFilters(HISTORY, {
      ...NO_TRADE_FILTERS,
      symbol: "SOL",
      direction: "long",
    });
    expect(noRows).toHaveLength(0);

    /**
     * Rows that are not trades. Both charts skip anything that is not a BUY or
     * a SELL — read from `cumulativePnl` and `bySymbol`, which both open with
     * `if (!isTrade(row)) continue` — so an instrument whose only events are
     * dividends has a populated table and two empty charts.
     *
     * This is the real EUN3 case: two events, nothing on either chart. The
     * screen has to say which emptiness this is, or it reads as a broken page.
     */
    const noTrades = applyTradeFilters(
      [
        row({ symbol: "EUN3", type: "DIVIDEND", realizedPnl: null, description: null }),
        row({ symbol: "EUN3", type: "DIVIDEND", realizedPnl: null, description: null }),
      ],
      { ...NO_TRADE_FILTERS, symbol: "EUN3" }
    );
    expect(noTrades).toHaveLength(2);
    expect(noTrades.filter(isTrade)).toHaveLength(0);
    expect(bySymbol(noTrades)).toEqual([]);
    expect(cumulativePnl(noTrades)).toEqual([]);
  });

  /**
   * The third shape, and the one the wording has to get right: real trades
   * that have not closed anything yet. Here the instrument *does* appear on
   * the chart, with nothing realised against it.
   */
  it("keeps an instrument on the chart when its trades are still open", () => {
    const open = [row({ symbol: "OPEN", type: "BUY", realizedPnl: null, description: null })];
    expect(bySymbol(open)[0].closedTrades).toBe(0);
    expect(open.filter(isTrade)).toHaveLength(1);
  });

  /**
   * Individually every offered option produces rows — asserted above and
   * confirmed against the real history. Combining two of them can still
   * produce none, which is correct and has to be said rather than shown as an
   * empty page.
   */
  it("allows a combination to be empty even when each part is not", () => {
    const bySymbolAlone = applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, symbol: "SOL" });
    const byDirectionAlone = applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, direction: "long" });

    expect(bySymbolAlone.length).toBeGreaterThan(0);
    expect(byDirectionAlone.length).toBeGreaterThan(0);
    expect(
      applyTradeFilters(HISTORY, { ...NO_TRADE_FILTERS, symbol: "SOL", direction: "long" })
    ).toHaveLength(0);
  });
});
