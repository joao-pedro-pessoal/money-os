import { NextResponse } from "next/server";
import { getNetWorth } from "@/actions/networth";
import { getTotalNetWorthOverTime } from "@/actions/analytics";
import { getAccountComposition, getMonthShape, getPortfolioItems } from "@/actions/dashboard";
import { getDividendOverview } from "@/actions/dividends";
import { listAllPositions, listConnections } from "@/actions/connections";
import { getRates } from "@/actions/fx";
import { toBase } from "@/lib/fx";
import { groupItems, hasPnl, portfolioSummary } from "@/lib/portfolio/positionView";
import { shortName } from "@/lib/portfolio/shortName";
import { tagLabel } from "@/lib/portfolio/tags";
import { downsample, movers, topPositions, topSlices } from "@/lib/widgets/summary";

export const dynamic = "force-dynamic";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Figures for the Android app's home-screen widgets and quick settings tile.
 *
 * Behind the session cookie like every page (see src/proxy.ts): the app sends
 * the cookie its WebView holds, so a phone that is not logged in gets the login
 * redirect and the widget says so instead of showing anything. Everything is in
 * the base currency and comes from the same actions the pages render.
 */
export async function GET() {
  const [nw, series, composition, month, portfolio, dividends, open, connections, rates] =
    await Promise.all([
      getNetWorth(),
      getTotalNetWorthOverTime(),
      getAccountComposition(),
      getMonthShape(),
      // The same list and summary the Investments page shows.
      getPortfolioItems(),
      getDividendOverview(),
      // The same rows and totals as the Open positions page.
      listAllPositions(),
      listConnections(),
      getRates(),
    ]);
  const base = nw.baseCurrency;
  const inBase = (amount: number, currency: string) => toBase(amount, currency, rates, base) ?? 0;

  const invested = portfolioSummary(portfolio.items);
  const measuredItems = portfolio.items.map((i) => ({
    name: shortName(i.symbol),
    value: i.value,
    pnl: i.pnl,
    measured: hasPnl(i) && !i.costUnknown && !i.atCost,
  }));

  const income = month.flows.income.total;
  const expenses = month.flows.expenses.total;
  const now = new Date();
  const thisYear = dividends.byYear.find((y) => y.year === now.getFullYear());
  const next = dividends.upcoming[0];

  return NextResponse.json(
    {
      currency: base,
      updatedAt: now.toISOString(),
      netWorth: round2(nw.total),
      series: downsample(series.map((p) => ({ date: p.date, value: p.netWorth })), 60),
      where: topSlices(
        composition.map((c) => ({ name: c.name, value: c.composition.total })),
        4
      ),
      investments: {
        value: round2(invested.floating + invested.stable),
        pnl: invested.pnl,
        pnlPercent: invested.pnlPercent,
        count: portfolio.items.length,
        // Every position: the widget scrolls.
        top: topPositions(measuredItems),
        allocation: topSlices(
          groupItems(portfolio.items, "assetType").map((g) => ({
            name: g.key === "—" ? "Untagged" : tagLabel(g.key, "assetType") ?? g.key,
            value: g.value,
          })),
          4
        ),
        movers: movers(measuredItems, 5),
      },
      dividends: {
        any: dividends.hasAny,
        total: round2(dividends.totalAll),
        thisYear: round2(thisYear?.total ?? 0),
        paymentsThisYear: thisYear?.payments ?? 0,
        next: next
          ? { name: next.instrumentName ?? next.ticker, month: next.date.toISOString() }
          : null,
      },
      trading: {
        count: open.length,
        unrealized: round2(open.reduce((s, p) => s + inBase(p.unrealizedPnl ?? 0, p.currency), 0)),
        margin: round2(
          connections.reduce((s, c) => s + inBase(Number(c.lastMarginUsed ?? 0), c.reportingCurrency ?? "USD"), 0)
        ),
        top: [...open]
          .sort((a, b) => Math.abs(inBase(b.unrealizedPnl ?? 0, b.currency)) - Math.abs(inBase(a.unrealizedPnl ?? 0, a.currency)))
          .slice(0, 8)
          .map((p) => ({
            name: p.coin,
            side: p.side,
            leverage: p.leverage,
            pnl: p.unrealizedPnl === null ? null : round2(inBase(p.unrealizedPnl, p.currency)),
          })),
      },
      month: {
        label: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        income: round2(income),
        expenses: round2(expenses),
        net: round2(income - expenses),
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
