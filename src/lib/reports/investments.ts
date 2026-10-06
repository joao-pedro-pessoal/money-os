/**
 * The investing side of a report: what one stretch of days did to the
 * portfolio.
 *
 * Like the money side, nothing here is a new definition. The time-weighted and
 * money-weighted returns are `lib/portfolio/returns.ts`, the comparison with an
 * index is `lib/portfolio/benchmark.ts`, realised results and fees are
 * `lib/trading/stats.ts` over the trades inside the period — the same functions
 * the Investments, Trade history and Dividends pages call, given the same rows
 * cut at the same two days. This file only does the cutting, and says which
 * figure could not be measured instead of printing a zero for it.
 *
 * Everything arrives already in one currency: the action converts before it
 * calls in, as every other caller of these functions does.
 *
 * Pure — no DB, no clock.
 */
import {
  BENCHMARK_REFUSALS,
  compareOverWindow,
  MAX_ALIGNMENT_GAP_DAYS,
  relativeToBenchmark,
} from "@/lib/portfolio/benchmark";
import {
  historyLooksLikePerformance,
  internalRateOfReturn,
  timeWeightedReturn,
  timeWeightedSeries,
  type CashFlow,
  type ValuePoint,
} from "@/lib/portfolio/returns";
import { bySymbol, cumulativePnl, isInstrumentTrade, type SymbolStats, type TradeRow } from "@/lib/trading/stats";
import { UNTAGGED } from "@/lib/portfolio/positionView";
import { tagLabel } from "@/lib/portfolio/tags";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dayOf = (date: string) => date.slice(0, 10);

/** A dividend or an interest credit, already converted. */
export interface IncomePayment {
  date: string;
  kind: "dividend" | "interest";
  /** The instrument's name or ticker; the account for interest on cash. */
  instrument: string;
  amount: number;
}

/** One position as it stands today. */
export interface HoldingNow {
  name: string;
  account: string;
  assetType: string | null;
  value: number;
  /** Null when nobody states what it cost: a zero would claim it is exactly break-even. */
  pnl: number | null;
}

export interface InvestmentReportInput {
  from: string;
  to: string;
  /** Today, on the wall: a period reaching it is the only one whose composition is known. */
  today: string;
  /** The portfolio's value over its whole history — what the Investments page draws. */
  values: readonly ValuePoint[];
  /** Deposits and withdrawals over the whole history, money in negative, as `returns.ts` takes them. */
  flows: readonly CashFlow[];
  /**
   * Why no money-weighted return can be stated at all, or null when it can.
   * The record of money going in is incomplete or not for the whole portfolio,
   * not for a period, so a period inherits the portfolio's answer.
   */
  moneyWeightedWithheld: string | null;
  /** Every trade and fee on record, with what each one closed. */
  trades: readonly TradeRow[];
  income: readonly IncomePayment[];
  /** The chosen index's stored closes, or null when none is chosen. */
  benchmark: {
    name: string;
    currency: string | null;
    expectedCurrency: string;
    points: readonly { date: string; close: number }[];
  } | null;
  /**
   * What is held today and the Investments page's own totals for it, or null
   * when it was not read. Used for a period that reaches today.
   */
  holdings: { held: number; unrealised: number; costUnknown: number; items: readonly HoldingNow[] } | null;
  /**
   * What was held on the period's last day, rebuilt from the same snapshots as
   * the value line, or null when it was not read. Used for a period that ended
   * before today; no cost is on record for a past day, so every `pnl` is null.
   */
  heldAtEnd?: readonly HoldingNow[] | null;
}

export interface BreakdownLine {
  name: string;
  value: number;
  /** Share of the whole, in percent. */
  percent: number;
}

export interface InvestmentReport {
  from: string;
  to: string;
  /**
   * Value at the start and the end, and the days those valuations were taken;
   * null without a valuation inside the period.
   */
  value: { start: number; end: number; change: number; startDate: string; endDate: string } | null;
  /** The value through the period, opening at the value it started from. */
  valueLine: ValuePoint[];
  /**
   * Deposits and withdrawals inside the period. `complete` is false when the
   * record of money going in cannot explain the portfolio — not every platform
   * reports them — so a zero here may be a deposit nobody recorded.
   */
  flows: { deposited: number; withdrawn: number; net: number; count: number; complete: boolean };
  /**
   * The change in value that deposits and withdrawals do not explain: markets.
   * Counted between the two valuations the change is read from, so a deposit
   * just before the period started is not mistaken for a gain. Null when the
   * value at either end is unknown, or when the deposit record is incomplete —
   * then `unexplainedWithheld` says so.
   */
  unexplained: number | null;
  unexplainedWithheld: string | null;
  trades: {
    bought: number;
    buys: number;
    sold: number;
    sells: number;
    /** What the venues say the trades of the period closed for. */
    realised: number;
    /** Fills that closed something. */
    closed: number;
    fees: number;
    /** Realised minus fees: the part you could spend. */
    net: number;
    bySymbol: SymbolStats[];
  };
  income: {
    dividends: number;
    interest: number;
    total: number;
    payments: number;
    byInstrument: { name: string; amount: number; payments: number }[];
  };
  returns: {
    timeWeighted: { total: number; annualised: number | null; from: string; to: string } | null;
    timeWeightedWithheld: string | null;
    /** For the period itself, not annualised: what a reader compares with the time-weighted figure. */
    moneyWeighted: number | null;
    moneyWeightedWithheld: string | null;
    /** The time-weighted line rebased to 100, the only portfolio line an index may be drawn against. */
    curve: ValuePoint[];
  };
  benchmark:
    | { name: string; curve: ValuePoint[]; indexReturn: number; differencePoints: number; from: string; to: string }
    | { name: string; unavailable: string }
    | null;
  /**
   * What was held at the end of the period: today's positions for a period that
   * reaches today, the period's last day rebuilt from snapshots for one that
   * ended earlier. `compositionNote` says why there is none.
   */
  composition: {
    asOf: string;
    /** True when `asOf` is today, the only day a gain or loss is known for. */
    today: boolean;
    held: number;
    /** Null for a past day: what each position cost then is not on record. */
    unrealised: number | null;
    costUnknown: number;
    byType: BreakdownLine[];
    largest: (BreakdownLine & { account: string; pnl: number | null })[];
  } | null;
  compositionNote: string | null;
  hasAnything: boolean;
}

function within<T extends { date: string }>(rows: readonly T[], from: string, to: string): T[] {
  return rows.filter((r) => dayOf(r.date) >= from && dayOf(r.date) <= to);
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/**
 * Value at the start and the end, the same way net worth is read: the start is
 * the last valuation before the period, else the first inside it.
 */
function valueBetween(sorted: readonly ValuePoint[], from: string, to: string) {
  const inside = within(sorted, from, to);
  if (inside.length === 0) return { change: null, line: [] as ValuePoint[] };
  const before = sorted.filter((p) => dayOf(p.date) < from).at(-1);
  const opening = before ?? inside[0];
  const closing = inside.at(-1)!;
  const start = opening.value;
  const end = closing.value;
  const line = before === undefined || dayOf(inside[0].date) === from
    ? inside.map((p) => ({ date: dayOf(p.date), value: round2(p.value) }))
    : [{ date: from, value: round2(before.value) }, ...inside.map((p) => ({ date: dayOf(p.date), value: round2(p.value) }))];
  return {
    change: {
      start: round2(start),
      end: round2(end),
      change: round2(end - start),
      startDate: dayOf(opening.date),
      endDate: dayOf(closing.date),
    },
    line,
  };
}

/**
 * Whether a flow falls between two valuations, as `returns.ts` reads them: a
 * valuation is taken before that day's deposits and withdrawals. So a flow on
 * the opening day happened after it and counts; one on the closing day is not
 * in the closing value yet and does not. Reading the closing day the other way
 * is the "deposit on the last day used to read as a loss" bug.
 */
function betweenValuations(flow: { date: string }, opening: string, closing: string): boolean {
  return dayOf(flow.date) >= opening && dayOf(flow.date) < closing;
}

const DEPOSITS_INCOMPLETE =
  "Not every platform reports deposits and withdrawals, so how much of the change they explain cannot be told apart from what markets did.";

/**
 * The valuations a return over the period is measured on.
 *
 * The one just before the period opens it, so the first day's movement counts —
 * but only when it is close enough to stand for the value on the first day.
 * Three weeks earlier, it would carry three weeks of someone else's period into
 * this one; the same tolerance the index is held to.
 */
function measuredValues(sorted: readonly ValuePoint[], from: string, to: string): ValuePoint[] {
  const inside = within(sorted, from, to);
  const before = sorted.filter((p) => dayOf(p.date) < from).at(-1);
  const opening = before !== undefined && daysApart(dayOf(before.date), from) <= MAX_ALIGNMENT_GAP_DAYS ? [before] : [];
  return [...opening, ...inside];
}

const TOO_FEW_VALUATIONS =
  "There are fewer than two valuations of the portfolio in this period, so there is nothing to measure a return between.";

const STILL_FILLING_IN =
  "In this period the value history is still being filled in — the accounts were being connected — so its growth is data arriving rather than the portfolio performing.";

/** The period's own return from an annual one: what the money-weighted rate came to over these days. */
function overPeriod(annual: number, days: number): number {
  return Math.pow(1 + annual, days / 365) - 1;
}

export function buildInvestmentReport(input: InvestmentReportInput): InvestmentReport {
  const { from, to } = input;
  const sorted = [...input.values].sort((a, b) => a.date.localeCompare(b.date));

  const { change: value, line: valueLine } = valueBetween(sorted, from, to);

  // Deposits and withdrawals. Money in is negative in `returns.ts`; here it is read the way a person says it.
  const flowsInside = within(input.flows, from, to).filter((f) => f.amount !== 0);
  const deposited = round2(flowsInside.filter((f) => f.amount < 0).reduce((s, f) => s - f.amount, 0));
  const withdrawn = round2(flowsInside.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0));
  const net = round2(deposited - withdrawn);
  // The portfolio's own guard: a record of money in that cannot explain what is held is not the whole record.
  const flowsComplete = input.moneyWeightedWithheld === null;

  let unexplained: number | null = null;
  let unexplainedWithheld: string | null = null;
  if (value !== null && !flowsComplete) {
    unexplainedWithheld = DEPOSITS_INCOMPLETE;
  } else if (value !== null) {
    const netBetween = input.flows
      .filter((f) => f.amount !== 0 && betweenValuations(f, value.startDate, value.endDate))
      .reduce((s, f) => s - f.amount, 0);
    unexplained = round2(value.change - netBetween);
  }

  // Trades, by the Trade history page's own rules: instrument trades only, results as the venues state them.
  const tradesInside = within(input.trades, from, to);
  const instrumentTrades = tradesInside.filter(isInstrumentTrade);
  const buys = instrumentTrades.filter((t) => t.type.toUpperCase() === "BUY");
  const sells = instrumentTrades.filter((t) => t.type.toUpperCase() === "SELL");
  const pnl = cumulativePnl([...tradesInside]).at(-1) ?? { realized: 0, fees: 0, net: 0 };

  const incomeInside = within(input.income, from, to);
  const dividends = incomeInside.filter((p) => p.kind === "dividend");
  const interest = incomeInside.filter((p) => p.kind === "interest");
  const perInstrument = new Map<string, { amount: number; payments: number }>();
  for (const p of dividends) {
    const entry = perInstrument.get(p.instrument) ?? { amount: 0, payments: 0 };
    entry.amount += p.amount;
    entry.payments += 1;
    perInstrument.set(p.instrument, entry);
  }
  const dividendTotal = round2(dividends.reduce((s, p) => s + p.amount, 0));
  const interestTotal = round2(interest.reduce((s, p) => s + p.amount, 0));

  // Returns, over the valuations of the period alone.
  const measured = measuredValues(sorted, from, to);
  let timeWeighted: InvestmentReport["returns"]["timeWeighted"] = null;
  let timeWeightedWithheld: string | null = null;
  let curve: ValuePoint[] = [];
  if (measured.length < 2) {
    timeWeightedWithheld = TOO_FEW_VALUATIONS;
  } else if (!historyLooksLikePerformance(measured)) {
    timeWeightedWithheld = STILL_FILLING_IN;
  } else {
    const twr = timeWeightedReturn(measured, [...input.flows]);
    if (twr === null) {
      timeWeightedWithheld = TOO_FEW_VALUATIONS;
    } else {
      timeWeighted = { total: twr.totalReturn, annualised: twr.annualised, from: twr.from, to: twr.to };
      curve = timeWeightedSeries(measured, [...input.flows]);
    }
  }

  let moneyWeighted: number | null = null;
  let moneyWeightedWithheld: string | null = input.moneyWeightedWithheld;
  if (moneyWeightedWithheld === null) {
    if (measured.length < 2) {
      moneyWeightedWithheld = TOO_FEW_VALUATIONS;
    } else {
      /**
       * The period as an investment of its own: the value it opened at is paid
       * in on the first day, the deposits and withdrawals happen when they did,
       * and what it is worth at the end comes back on the last.
       */
      const opening = measured[0];
      const closing = measured.at(-1)!;
      const between = input.flows.filter(
        (f) => f.amount !== 0 && betweenValuations(f, dayOf(opening.date), dayOf(closing.date))
      );
      const rate = internalRateOfReturn([
        { date: dayOf(opening.date), amount: -opening.value },
        ...between.map((f) => ({ date: dayOf(f.date), amount: f.amount })),
        { date: dayOf(closing.date), amount: closing.value },
      ]);
      const span = daysApart(dayOf(opening.date), dayOf(closing.date));
      if (rate === null || span <= 0) {
        moneyWeightedWithheld =
          "The money going in and the value coming out of this period do not settle on a rate, so none is stated.";
      } else {
        moneyWeighted = overPeriod(rate, span);
      }
    }
  }

  let benchmark: InvestmentReport["benchmark"] = null;
  if (input.benchmark !== null) {
    if (timeWeighted === null) {
      benchmark = {
        name: input.benchmark.name,
        unavailable: "There is no time-weighted return for this period to compare with, so there is no comparison either.",
      };
    } else {
      const result = compareOverWindow({
        points: input.benchmark.points,
        currency: input.benchmark.currency,
        expectedCurrency: input.benchmark.expectedCurrency,
        from: timeWeighted.from,
        to: timeWeighted.to,
      });
      benchmark = result.ok
        ? {
            name: input.benchmark.name,
            curve: result.comparison.curve,
            indexReturn: result.comparison.indexReturn,
            differencePoints: relativeToBenchmark(timeWeighted.total, result.comparison.indexReturn),
            from: result.comparison.from,
            to: result.comparison.to,
          }
        : { name: input.benchmark.name, unavailable: BENCHMARK_REFUSALS[result.reason] };
    }
  }

  /**
   * What was held at the end. A period reaching today takes today's positions,
   * with the Investments page's own totals; one that ended earlier takes the
   * positions rebuilt for its last day, which add up to the value line there.
   */
  const reachesToday = to >= input.today;
  const atEnd = reachesToday
    ? input.holdings === null
      ? null
      : { ...input.holdings, today: true, asOf: input.today }
    : input.heldAtEnd === undefined || input.heldAtEnd === null
      ? null
      : {
          items: input.heldAtEnd,
          held: round2(input.heldAtEnd.reduce((s, i) => s + i.value, 0)),
          unrealised: null,
          costUnknown: 0,
          today: false,
          asOf: to,
        };

  let composition: InvestmentReport["composition"] = null;
  let compositionNote: string | null = null;
  if (atEnd === null) {
    compositionNote = "What was held at the end of this period was not read.";
  } else if (atEnd.items.every((i) => i.value === 0)) {
    compositionNote = reachesToday ? "Nothing is held today." : `Nothing was held on ${to}.`;
  } else {
    const items = atEnd.items.filter((i) => i.value !== 0);
    const total = items.reduce((s, i) => s + i.value, 0);
    const share = (v: number) => (total === 0 ? 0 : round2((v / total) * 100));
    // Grouped and named the way the Investments page groups by asset type.
    const byType = new Map<string, number>();
    for (const i of items) byType.set(i.assetType ?? UNTAGGED, (byType.get(i.assetType ?? UNTAGGED) ?? 0) + i.value);
    const typeName = (key: string) => (key === UNTAGGED ? "Untagged" : tagLabel(key, "assetType") ?? key);
    composition = {
      asOf: atEnd.asOf,
      today: atEnd.today,
      held: atEnd.held,
      unrealised: atEnd.unrealised,
      costUnknown: atEnd.costUnknown,
      byType: [...byType.entries()]
        .map(([key, v]) => ({ name: typeName(key), value: round2(v), percent: share(v) }))
        .sort((a, b) => b.value - a.value),
      largest: [...items]
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
        .map((i) => ({ name: i.name, account: i.account, value: round2(i.value), percent: share(i.value), pnl: i.pnl })),
    };
    if (!atEnd.today) {
      compositionNote =
        "Rebuilt from each position's recorded values on that day, at today's exchange rates, like the value line. What each position cost then is not on record, so no gain or loss is stated.";
    }
  }

  return {
    from,
    to,
    value,
    valueLine,
    flows: { deposited, withdrawn, net, count: flowsInside.length, complete: flowsComplete },
    unexplained,
    unexplainedWithheld,
    trades: {
      bought: round2(buys.reduce((s, t) => s + Math.abs(t.amount), 0)),
      buys: buys.length,
      sold: round2(sells.reduce((s, t) => s + Math.abs(t.amount), 0)),
      sells: sells.length,
      realised: pnl.realized,
      closed: instrumentTrades.filter((t) => t.realizedPnl !== null).length,
      fees: pnl.fees,
      net: pnl.net,
      bySymbol: bySymbol([...tradesInside]).slice(0, 10),
    },
    income: {
      dividends: dividendTotal,
      interest: interestTotal,
      total: round2(dividendTotal + interestTotal),
      payments: incomeInside.length,
      byInstrument: [...perInstrument.entries()]
        .map(([name, e]) => ({ name, amount: round2(e.amount), payments: e.payments }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    },
    returns: { timeWeighted, timeWeightedWithheld, moneyWeighted, moneyWeightedWithheld, curve },
    benchmark,
    composition,
    compositionNote,
    hasAnything:
      valueLine.length > 0 ||
      flowsInside.length > 0 ||
      tradesInside.length > 0 ||
      incomeInside.length > 0 ||
      composition !== null,
  };
}

/** A fraction as a percentage for a file: 0.1234 becomes 12.34. */
const percentOf = (rate: number | null) => (rate === null ? null : round2(rate * 100));

/** The investing part of the CSV, one section after another, in the same currency as the rest. */
export function investmentCsvLines(report: InvestmentReport): (string | number | null)[][] {
  const lines: (string | number | null)[][] = [
    ["Investments", "This period"],
    ["Value at start", report.value?.start ?? null],
    ["Value at end", report.value?.end ?? null],
    ["Value change", report.value?.change ?? null],
    ["Deposited", report.flows.deposited],
    ["Withdrawn", report.flows.withdrawn],
    ["Change not explained by deposits", report.unexplained, report.unexplainedWithheld],
    ["Bought", report.trades.bought],
    ["Sold", report.trades.sold],
    ["Realised from trades", report.trades.realised],
    ["Trading fees", report.trades.fees],
    ["Dividends", report.income.dividends],
    ["Interest", report.income.interest],
    ["Time-weighted return %", percentOf(report.returns.timeWeighted?.total ?? null)],
    ["Money-weighted return %", percentOf(report.returns.moneyWeighted)],
  ];
  if (report.benchmark !== null && "indexReturn" in report.benchmark) {
    lines.push(
      [`${report.benchmark.name} return %`, percentOf(report.benchmark.indexReturn)],
      ["Ahead of the index, points", report.benchmark.differencePoints]
    );
  }
  if (report.trades.bySymbol.length > 0) {
    lines.push([], ["Instrument", "Closed trades", "Realised", "Fees", "Net"]);
    for (const s of report.trades.bySymbol) lines.push([s.symbol, s.closedTrades, s.realized, s.fees, s.net]);
  }
  if (report.income.byInstrument.length > 0) {
    lines.push([], ["Dividends from", "Payments", "Amount"]);
    for (const d of report.income.byInstrument) lines.push([d.name, d.payments, d.amount]);
  }
  if (report.composition !== null) {
    lines.push([], [`Held on ${report.composition.asOf}, by type`, "Value", "Share %"]);
    for (const t of report.composition.byType) lines.push([t.name, t.value, t.percent]);
    lines.push([], ["Largest positions", "Account", "Value", "Share %", "Unrealised"]);
    for (const p of report.composition.largest) lines.push([p.name, p.account, p.value, p.percent, p.pnl]);
  }
  return lines;
}

