import {
  listHoldingsWithPnL,
  createHolding,
  getPortfolioValueOverTime,
  listAccountsForHoldings,
} from "@/actions/investments";
import { listPlaylists } from "@/actions/playlists";
import { getPortfolioItems } from "@/actions/dashboard";
import PortfolioTable from "@/components/PortfolioTable";
import { portfolioSummary } from "@/lib/portfolio/positionView";
import { getPortfolioContribution } from "@/actions/investments";
import { Money } from "@/components/PrivacyContext";
import { fmt } from "@/lib/format";
import TimeSeriesCard from "@/components/TimeSeriesCard";
import Section from "@/components/Section";
import AutoSync from "@/components/AutoSync";
import { autoRefreshPricesAction, lastQuoteRefreshAt } from "@/actions/quotes";
import { REPRICE_AFTER_MINUTES } from "@/lib/quotes/staleness";
import HoldingFormFields from "@/components/HoldingFormFields";
import Link from "next/link";
import StatementHistory from "@/components/StatementHistory";
import { getRealisedTotal } from "@/actions/dividends";
import PortfolioAudit from "@/components/PortfolioAudit";
import UnitemisedInvestments from "@/components/UnitemisedInvestments";
import { getUnitemisedInvestments } from "@/actions/investments";
import AdoptStatementPositions from "@/components/AdoptStatementPositions";
import {
  getImportedStatements,
  adoptStatementPositions,
  listKnownIsins,
} from "@/actions/brokerImport";
import QuoteProbe from "@/components/QuoteProbe";
import AutoPrice from "@/components/AutoPrice";
import PricingCrossCheck from "@/components/PricingCrossCheck";

/** A form action may not return a value; the counts go to the audit log. */
async function adoptAction(formData: FormData) {
  "use server";
  await adoptStatementPositions(formData);
}

export default async function InvestmentsPage() {
  const [
    { holdings },
    valueSeries,
    accountList,
    playlistList,
    lastPricedAt,
  ] = await Promise.all([
    listHoldingsWithPnL(),
    getPortfolioValueOverTime(),
    listAccountsForHoldings(),
    listPlaylists(),
    lastQuoteRefreshAt(),
  ]);
  const contribution = await getPortfolioContribution();
  // Manual holdings, open trades and coin balances in one shape, so one table
  // can group them and one chart can measure what that table is showing.
  const portfolioItems = await getPortfolioItems();



  const unitemised = await getUnitemisedInvestments();
  const importedStatements = await getImportedStatements();
  const knownIsins = await listKnownIsins();
  const realised = await getRealisedTotal();
  const summary = portfolioSummary(portfolioItems.items);

  const base = portfolioItems.baseCurrency;
  const pnlColor =
    summary.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]";
  /** Sales you closed on positions you keep yourself. */
  const realizedTotal =
    Math.round(
      (holdings.reduce((s, h) => s + (h.realizedPnl ?? 0), 0) +
        Number.EPSILON) *
        100,
    ) / 100;

  /**
   * Says what the figure is made of, so it can't be read as sales alone.
   *
   * `realizedTotal` is listed here because the card adds it. It was left out
   * while it happened to be zero, which meant the note would have stopped
   * explaining the number above it the moment a manual position was sold —
   * the one case where you'd most want to know where the money came from.
   */
  const realisedNote = [
    realised.tradesUnknown ? null : `${realised.trades!.toFixed(2)} platform trades`,
    realizedTotal === 0 ? null : `${realizedTotal.toFixed(2)} manual sales`,
    realised.dividends === 0 ? null : `${realised.dividends.toFixed(2)} dividends`,
    realised.interest === 0 ? null : `${realised.interest.toFixed(2)} interest`,
  ]
    .filter(Boolean)
    .join(" + ") || "nothing realised yet";

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Investments</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            Everything you hold, synced and manual, in one place. Account
            balances hold your idle cash; positions add on top.
          </p>
          {/*
            Keeps quoted prices current while this page is open.

            The scheduled route does the same, but it lives in the
            docker-compose scheduler and needs SYNC_SECRET — someone running
            `npm run dev` has neither, which is how eleven prices sat fifteen
            days old while the machinery to refresh them worked perfectly. This
            needs nothing configured and stops when the tab is not visible.
          */}
          <div className="mt-1">
            <AutoSync
              syncAction={autoRefreshPricesAction}
              lastSyncAt={lastPricedAt}
              staleMinutes={REPRICE_AFTER_MINUTES}
              intervalMinutes={REPRICE_AFTER_MINUTES}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/investments/playlists" className="btn whitespace-nowrap">
            Playlists
          </Link>
          <Link href="/investments/watchlist" className="btn whitespace-nowrap">
            Watchlist
          </Link>
          <Link href="/investments/analysis" className="btn whitespace-nowrap">
            Analysis
          </Link>
        </div>
      </div>

      {/* Computed from the same items the table shows. These used to come from
          manual holdings alone, so with everything synced they read zero while
          the table below reported a real loss. Two numbers for one question is
          worse than either being wrong. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* One definition for all five cards: everything the table below shows.
            Portfolio Value used to come from getPortfolioContribution, which
            deliberately excludes positions already inside an account balance —
            so it read 84 next to a Market-exposed of 177, and the two could
            never be reconciled by anyone looking at them. What the contribution
            figure answers is a different question, and it now says so. */}
        <Stat
          label="Portfolio Value"
          value={summary.floating + summary.stable}
          currency={base}
          note={
            contribution.portfolioValue !== summary.floating + summary.stable
              ? `${contribution.portfolioValue.toFixed(2)} of this is new to Net Worth`
              : "counted once in Net Worth"
          }
        />
        <Stat
          label="Unrealized P&L"
          value={summary.pnl}
          currency={base}
          className={pnlColor}
          // On cost, which is what a return is measured against. The note used
          // to say "of what can move" — naming the market value as the
          // denominator when the arithmetic uses the cost, so the words and the
          // number described two different things.
          note={`${summary.pnlPercent.toFixed(2)}% on ${fmt(summary.cost, base)} invested`}
        />
        <Stat
          label="Market-exposed"
          value={summary.floating}
          currency={base}
          note={`cost ${summary.cost.toFixed(2)}`}
        />
        <Stat
          label="Cash & stablecoins"
          value={summary.stable}
          currency={base}
          note={
            summary.projectedYield > 0
              ? `earning ${summary.projectedYield.toFixed(2)}/yr`
              : summary.unratedStable > 0
                ? "no interest rate set"
                : undefined
          }
        />
        <Stat
          label="Realized P&L"
          value={realised.total + realizedTotal}
          currency={base}
          className={
            realised.total + realizedTotal >= 0
              ? "text-[var(--green)]"
              : "text-[var(--red)]"
          }
          // Everything that has actually been paid: sales closed, dividends
          // received and interest credited. Interest and dividends belong here
          // — they arrived and stayed, and nothing about them is on paper.
          note={realisedNote}
        />
      </div>

      <TimeSeriesCard
        title="Portfolio value over time"
        series={valueSeries.map((p) => ({ date: p.date, value: p.portfolioValue }))}
        currency={contribution.baseCurrency}
        note="Built from snapshots, so it starts the day tracking did. An imported statement reaches further back but records prices paid, not what things were worth since."
      />

      {/* What the statement can account for, which is further back than any
          snapshot but a different measure — see the component. */}
      <StatementHistory />

      {/* The five cards above, reconciled per platform. */}
      <PortfolioAudit items={portfolioItems.items} currency={base} />


      {/* One table for everything you hold, grouped and filtered however you
          want to look at it — and the chart measures whatever it is showing,
          so the two cannot drift apart. Open trades are listed but NOT counted
          in Portfolio Value: their value is already inside the account equity. */}
      <div className="card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
          <div className="text-sm font-medium">What you hold</div>
          <div className="text-xs text-[var(--muted)]">
            open trades are shown but not added to Portfolio Value
          </div>
        </div>
        <div className="text-xs text-[var(--muted)] mb-3">
          Tag positions on the{" "}
          <Link href="/positions" className="text-[var(--accent)]">
            Positions page
          </Link>{" "}
          and they group here.
        </div>
        <PortfolioTable
          items={portfolioItems.items}
          currency={portfolioItems.baseCurrency}
        />
      </div>

      {/* Placed directly under the table, because the question it answers is
          "why doesn't this add up to the dashboard?" — which you ask while
          looking at the table, not somewhere else on the page. */}
      <UnitemisedInvestments
        items={unitemised.items}
        total={unitemised.total}
        currency={unitemised.baseCurrency}
      />

      {/* Right under the table, because that is where you notice the rows are
          read-only and want to do something about it. */}
      <AdoptStatementPositions accounts={importedStatements} action={adoptAction} />

      {/* Only worth showing once there are ISINs to ask about. */}
      {/* The automatic route first; the gateway probe stays as the manual
          fallback for anything Stooq doesn't carry. */}
      {knownIsins.length > 0 && <AutoPrice />}
      {/* Immediately under the button that sets the prices, because that is
          when a disagreement is worth knowing about. */}
      <PricingCrossCheck />
      {knownIsins.length > 0 && <QuoteProbe suggestions={knownIsins} />}

      <Section title="Add a position by hand" summary="for anything not synced">
        <form action={createHolding} className="space-y-3 max-w-2xl">
          <input
            name="symbol"
            placeholder="Symbol (e.g. VWCE, AAPL, USDC)"
            className="input"
            required
          />
          <input name="name" placeholder="Name (optional)" className="input" />
          <select name="accountId" className="input" required defaultValue="">
            <option value="">Account holding this position…</option>
            {accountList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.institution} — {a.name}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              name="quantity"
              type="number"
              step="0.00000001"
              placeholder="Quantity"
              className="input"
              required
            />
            <select name="currency" className="input">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>

          <HoldingFormFields playlistOptions={playlistList} />

          <button type="submit" className="btn w-full">
            Add position
          </button>
        </form>
      </Section>
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
  currency = "EUR",
  note,
}: {
  label: string;
  value: number;
  className?: string;
  currency?: string;
  note?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className={`text-xl font-semibold truncate ${className}`}>
        <Money value={value} currency={currency} />
      </div>
      {note && <div className="text-[10px] text-[var(--muted)] mt-1 truncate">{note}</div>}
    </div>
  );
}
