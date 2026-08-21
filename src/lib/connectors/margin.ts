/**
 * How much of a leveraged account is actually free.
 *
 * Equity is not availability. With open positions, part of the equity is locked
 * as margin backing them — showing the full number as "free" invites you to
 * plan around money you cannot touch, and on a leveraged account that is a
 * quick way to get liquidated.
 *
 * Hyperliquid already tells us both figures; we were storing them and showing
 * neither.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface MarginState {
  /** Total account value including unrealised P&L. */
  equity: number;
  /** Locked behind open positions. */
  marginUsed: number | null;
  /** What the platform says you could withdraw right now. */
  withdrawable: number | null;
}

export interface MarginView {
  equity: number;
  marginUsed: number;
  /** Free to open new trades or take out. */
  available: number;
  /** Share of equity locked, 0-100. */
  usedPercent: number | null;
  /** True when the platform gave us a real figure rather than a derived one. */
  reported: boolean;
}

/**
 * Prefers what the platform reports over anything we can derive.
 *
 * `withdrawable` accounts for the venue's own rules — maintenance margin,
 * unrealised losses, pending orders — which a subtraction here would miss. It
 * is only computed as `equity − margin` when the platform didn't say, and that
 * fallback is flagged so the UI doesn't present a guess as a fact.
 */
export function marginView(state: MarginState): MarginView {
  const marginUsed = state.marginUsed ?? 0;

  const reported = state.withdrawable !== null;
  const available = reported
    ? Math.max(0, state.withdrawable!)
    : Math.max(0, state.equity - marginUsed);

  return {
    equity: round2(state.equity),
    marginUsed: round2(marginUsed),
    available: round2(available),
    usedPercent: state.equity <= 0 ? null : round2((marginUsed / state.equity) * 100),
    reported,
  };
}

export interface PositionRisk {
  /** Full market exposure — what the position controls. */
  notional: number;
  /** Capital actually committed, and the most a normal move can cost you. */
  atRisk: number;
  leverage: number | null;
  /** True when the platform reported the margin rather than us dividing. */
  reported: boolean;
}

/**
 * What a position can actually lose you.
 *
 * A 5× short controlling €258 of silver is not €258 of your money — it's about
 * €52 of margin controlling €258 of exposure. Listing the notional as the
 * position's "value" overstates your portfolio by the leverage factor and makes
 * the allocation chart mostly a picture of how leveraged you are.
 *
 * `marginUsed` from the platform wins, because it accounts for the venue's own
 * initial-margin rules. Dividing notional by leverage is the fallback.
 *
 * This is capital committed, not a floor on losses: leverage means a position
 * can lose more than its margin, which is why liquidations exist.
 */
export function capitalAtRisk(input: {
  positionValue: number | null;
  marginUsed: number | null;
  leverage: number | null;
}): PositionRisk {
  const notional = Math.abs(input.positionValue ?? 0);

  if (input.marginUsed !== null && input.marginUsed > 0) {
    return { notional: round2(notional), atRisk: round2(Math.abs(input.marginUsed)), leverage: input.leverage, reported: true };
  }

  // No leverage information means it isn't leveraged — a cash equity position
  // risks its whole value.
  const lev = input.leverage !== null && input.leverage > 0 ? input.leverage : 1;
  return {
    notional: round2(notional),
    atRisk: round2(notional / lev),
    leverage: input.leverage,
    reported: false,
  };
}

export type MarginPressure = "comfortable" | "tight" | "stretched";

/**
 * How close the account is to having nothing spare.
 *
 * Bands rather than a single number because the useful question isn't "what
 * percentage" but "should I be worried". Deliberately not called a liquidation
 * warning: that depends on each position's own maintenance margin and mark
 * price, which this doesn't know.
 */
export function pressureOf(view: MarginView): MarginPressure {
  if (view.usedPercent === null) return "comfortable";
  if (view.usedPercent >= 80) return "stretched";
  if (view.usedPercent >= 50) return "tight";
  return "comfortable";
}

export function describePressure(view: MarginView): string {
  switch (pressureOf(view)) {
    case "stretched":
      return "Most of this account is backing open positions. Little room to add, and less room for the market to move against you.";
    case "tight":
      return "A good part of this account is tied up as margin.";
    default:
      return "";
  }
}
