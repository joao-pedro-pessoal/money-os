/**
 * Where the money actually came from.
 *
 * "Up €300" is one number hiding four different facts, and they behave
 * differently: a paper gain can evaporate tomorrow, a dividend is in the bank,
 * and interest on idle cash keeps arriving whatever the market does. Adding
 * them into a single figure is how people mistake a good quarter for a good
 * strategy.
 *
 * The distinction that matters most here is **realised against unrealised**.
 * Realised money is yours: sales you closed, dividends paid, interest credited.
 * Unrealised is an opinion the market currently holds about what you own.
 *
 * Interest on idle cash counts as realised — it was paid, it landed, and
 * nothing about it is a paper gain. Filing it anywhere else was wrong.
 *
 * Pure — no DB, no network.
 */

export const SOURCES = [
  {
    value: "unrealised",
    label: "Unrealised P&L",
    realised: false,
    help: "What open positions are worth against what you paid. Not yours until you sell.",
  },
  {
    value: "realisedTrades",
    label: "Realised on sales",
    realised: true,
    help: "Profit and loss on positions you actually closed, as the platform reports it.",
  },
  {
    value: "dividends",
    label: "Dividends",
    realised: true,
    help: "Distributions paid by instruments you hold. Already in the account.",
  },
  {
    value: "interest",
    label: "Interest on cash",
    realised: true,
    help: "Paid on money sitting idle. Realised income — it arrived whatever the market did.",
  },
] as const;

export type SourceKey = (typeof SOURCES)[number]["value"];

export interface AttributionInput {
  /** Sum of unrealised P&L across open positions. */
  unrealised: number;
  /** All-time realised P&L on closed trades, where a platform states one. */
  realisedTrades: number | null;
  dividends: number;
  interest: number;
}

export interface AttributionLine {
  key: SourceKey;
  label: string;
  help: string;
  realised: boolean;
  amount: number;
  /**
   * Share of the total *magnitude*, not of the net.
   *
   * Percentages of a net figure are nonsense when the parts have opposite
   * signs: lose €100 and earn €110 and the net is €10, which would make the
   * loss "−1000%". Sizing by magnitude answers the question actually being
   * asked — how much of what moved came from where.
   */
  share: number;
}

export interface Attribution {
  lines: AttributionLine[];
  /** Everything added up, signs included. */
  net: number;
  /** The part that is money in hand. */
  realised: number;
  /** The part the market could still take back. */
  unrealised: number;
  /** True when a platform doesn't report realised trade P&L, so it's absent. */
  realisedTradesUnknown: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function attribute(input: AttributionInput): Attribution {
  const amounts: Record<SourceKey, number> = {
    unrealised: input.unrealised,
    // Null means the platform never said. Treated as zero for the arithmetic
    // but flagged, so the interface can say "not reported" instead of "€0.00"
    // — those are very different claims to make about someone's money.
    realisedTrades: input.realisedTrades ?? 0,
    dividends: input.dividends,
    interest: input.interest,
  };

  const magnitude = Object.values(amounts).reduce((s, v) => s + Math.abs(v), 0);

  const lines: AttributionLine[] = SOURCES.map((s) => ({
    key: s.value,
    label: s.label,
    help: s.help,
    realised: s.realised,
    amount: round2(amounts[s.value]),
    share: magnitude === 0 ? 0 : round2((Math.abs(amounts[s.value]) / magnitude) * 100),
  }));

  const realised = SOURCES.filter((s) => s.realised).reduce((sum, s) => sum + amounts[s.value], 0);

  return {
    lines,
    net: round2(Object.values(amounts).reduce((s, v) => s + v, 0)),
    realised: round2(realised),
    unrealised: round2(amounts.unrealised),
    realisedTradesUnknown: input.realisedTrades === null,
  };
}

/**
 * How much of what you've made is actually yours.
 *
 * Null rather than 0 or 100 when nothing has moved at all: a portfolio that
 * has gained nothing hasn't realised 0% of its gains, it has no gains to
 * describe, and printing "0% realised" would read as a judgement.
 */
export function realisedShare(a: Attribution): number | null {
  const total = Math.abs(a.realised) + Math.abs(a.unrealised);
  if (total === 0) return null;
  return round2((Math.abs(a.realised) / total) * 100);
}
