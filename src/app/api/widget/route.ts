import { NextResponse } from "next/server";
import { getNetWorth } from "@/actions/networth";
import { getTotalNetWorthOverTime } from "@/actions/analytics";
import { getAccountComposition, getMonthShape } from "@/actions/dashboard";
import { downsample, topSlices } from "@/lib/widgets/summary";

export const dynamic = "force-dynamic";

/**
 * Figures for the Android app's home-screen widgets and quick settings tile.
 *
 * Behind the session cookie like every page (see src/proxy.ts): the app sends
 * the cookie its WebView holds, so a phone that is not logged in gets the login
 * redirect and the widget says so instead of showing anything. Everything is in
 * the base currency and comes from the same actions the dashboard renders.
 */
export async function GET() {
  const [nw, series, composition, month] = await Promise.all([
    getNetWorth(),
    getTotalNetWorthOverTime(),
    getAccountComposition(),
    getMonthShape(),
  ]);

  const income = month.flows.income.total;
  const expenses = month.flows.expenses.total;
  const now = new Date();

  return NextResponse.json(
    {
      currency: nw.baseCurrency,
      updatedAt: now.toISOString(),
      netWorth: Math.round(nw.total * 100) / 100,
      series: downsample(series.map((p) => ({ date: p.date, value: p.netWorth })), 60),
      where: topSlices(
        composition.map((c) => ({ name: c.name, value: c.composition.total })),
        4
      ),
      month: {
        label: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        income: Math.round(income * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
        net: Math.round((income - expenses) * 100) / 100,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
