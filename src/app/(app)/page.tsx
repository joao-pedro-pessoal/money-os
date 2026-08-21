import { listAccountsWithState } from "@/actions/accounts";
import { listTransactions } from "@/actions/transactions";
import { getNetWorth } from "@/actions/networth";
import { getAccountPlatformTotals } from "@/actions/connections";
import { getSubscriptionTotals } from "@/actions/subscriptions";
import { getRates } from "@/actions/fx";
import { sumInBase, toBase } from "@/lib/fx";
import { Money } from "@/components/PrivacyContext";
import AccountsCard, { type AccountRow } from "@/components/AccountsCard";
import NetWorthChart from "@/components/NetWorthChart";
import DonutChart from "@/components/DonutChart";
import Section from "@/components/Section";
import FlowBars from "@/components/FlowBars";
import { getAccountComposition, getMonthShape } from "@/actions/dashboard";
import { listPurposes } from "@/actions/purpose";
import { listGoalsByPriority } from "@/actions/distribute";
import { getTotalNetWorthOverTime } from "@/actions/analytics";
import { fmt } from "@/lib/format";
import Link from "next/link";
import { unallocatedCash, explainFree, splitPortfolioCash } from "@/lib/accounting/unallocated";
import { getFavouriteCurrencies, getDashboardCurrency } from "@/actions/settings";
import { resolveDisplayCurrency } from "@/lib/fx/favourites";
import CurrencySwitch from "@/components/CurrencySwitch";
import Explain from "@/components/Explain";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  /**
   * Reading the same money in another currency.
   *
   * Display only: `base` stays what every total is stored and compared in, so
   * switching here converts what you see and changes nothing the app keeps.
   * Anything not on the favourites list falls back to the base rather than
   * rendering nulls for a currency with no rate.
   */
  const [{ currency: requestedCurrency }, favouriteCurrencies, savedDashboardCurrency] =
    await Promise.all([searchParams, getFavouriteCurrencies(), getDashboardCurrency()]);
  const accounts = await listAccountsWithState();
  const recentTx = await listTransactions(8);
  // Every money total on this page comes from one place — see
  // src/lib/accounting/networth.ts for why.
  const nw = await getNetWorth();
  const rates = await getRates();
  // What everything is stored and compared in.
  const storedBase = nw.baseCurrency;
  // What this page renders in, which may differ and says so.
  /**
   * The URL wins over the saved preference, which wins over the base.
   *
   * So the setting decides what you see every day, and a link can still show
   * you the same page in another currency without changing anything.
   */
  const display = resolveDisplayCurrency(
    requestedCurrency ?? savedDashboardCurrency,
    favouriteCurrencies,
    storedBase
  );

  /**
   * Converted once, at the boundary between "what the app stores" and "what
   * this page shows".
   *
   * Every action returns figures in the stored base currency. Threading a
   * display currency through all of them would have meant changing a dozen
   * call sites and missing one — which is exactly what happened: Net Worth was
   * rendered as euros carrying a dollar sign, while Free Cash converted
   * correctly because the page happened to compute it itself. Mislabelling a
   * total is worse than not converting it.
   */
  const inDisplay = (amount: number): number =>
    toBase(amount, storedBase, rates, display) ?? amount;

  // Figures the page converts from an account's own currency already target
  // the display currency directly; `base` below is only for those.
  const base = display;
  const platformTotals = await getAccountPlatformTotals();

  const [composition, month, purposes, netWorthSeries, ranked] = await Promise.all([
    getAccountComposition(),
    getMonthShape(),
    listPurposes(),
    getTotalNetWorthOverTime(),
    listGoalsByPriority(),
  ]);

  /**
   * Most important first, not biggest first.
   *
   * Sorting by value showed whichever goal happened to hold the most, which is
   * usually the one you've already finished. Your ranking says which ones you
   * still care about.
   */
  const totalsById = new Map(purposes.purposes.map((p) => [p.id, p]));
  const topBuckets = ranked
    .map((g) => totalsById.get(g.id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .slice(0, 5);
  const bucketTotalValue = purposes.purposes.reduce((s, p) => s + p.totals.total, 0);
  const totalFloating = composition.reduce((s, c) => s + c.composition.floating, 0);

  /**
   * Flattened for the client component: a Map can't cross the boundary, and
   * the filters need a comparable value per row rather than a raw balance in
   * whatever currency the account happens to use.
   */
  const compositionById = new Map(composition.map((c) => [c.id, c.composition]));

  const accountRows: AccountRow[] = accounts.map((a) => {
    const p = platformTotals.get(a.id);
    // For a connected account, `balance` is the account's own value — show what's
    // really on the platform (equity + spot).
    const displayValue = p ? p.total : a.balance;
    const comp = compositionById.get(a.id);
    return {
      // How much of this account the market can move. Shown in parentheses so
      // the headline figure never hides how much of it isn't guaranteed.
      floating: comp?.floating ?? 0,
      id: a.id,
      name: a.name,
      institution: a.institution,
      accountType: a.accountType,
      currency: a.currency,
      displayValue,
      baseValue: toBase(displayValue, a.currency, rates, base),
      /**
       * Free means committed to nothing.
       *
       * A connected account used to report the platform's available margin and
       * stop there, silently ignoring bucket allocations — so an emergency fund
       * held on an exchange read as spendable money. Both deductions now apply,
       * to synced and manual accounts alike.
       */
      // The share of this account's spare cash that is investing money, which
      // the dashboard's free-cash figure must not include.
      portfolioCashPercent: a.portfolioCashPercent === null ? null : Number(a.portfolioCashPercent),
      free: p
        ? unallocatedCash({
            // Already has margin deducted by the connector.
            availableOnPlatform: p.available - p.spot,
            separatePool: p.spot,
            allocatedToBuckets: a.allocated,
            marginUsed: p.marginUsed,
          }).free
        : a.free,
      freeExplained: p
        ? explainFree(
            unallocatedCash({
              availableOnPlatform: p.available - p.spot,
              separatePool: p.spot,
              allocatedToBuckets: a.allocated,
              marginUsed: p.marginUsed,
            }),
            a.currency
          )
        : explainFree(
            unallocatedCash({ availableOnPlatform: a.balance, allocatedToBuckets: a.allocated }),
            a.currency
          ),
      marginUsed: p?.marginUsed ?? 0,
      /**
       * Everything converted once, here, so the card never mixes currencies.
       * A dollar figure beside a euro total is unreconcilable by eye, and this
       * is the page people check first.
       */
      freeInBase: toBase(p ? p.available : a.free, a.currency, rates, base) ?? undefined,
      equityInBase: toBase(p?.equity ?? 0, a.currency, rates, base) ?? undefined,
      spotInBase: toBase(p?.spot ?? 0, a.currency, rates, base) ?? undefined,
      pnlInBase: toBase(p?.unrealizedPnl ?? 0, a.currency, rates, base) ?? undefined,
      // Account value minus what the venue says you can trade with.
      inTrade:
        p === undefined
          ? undefined
          : toBase(Math.max(0, p.equity + p.spotOnTop - p.available), a.currency, rates, base) ??
            undefined,
      connected: p !== undefined,
      equity: p?.equity ?? 0,
      spot: p?.spot ?? 0,
      spotOnTop: p?.spotOnTop ?? 0,
      unrealizedPnl: p?.unrealizedPnl ?? 0,
      baseCurrency: base,
    };
  });

  const unconverted = nw.unconverted;
  const totalFree = sumInBase(
    /**
     * Only the part you could actually live on.
     *
     * Cash waiting in a broker to buy something is free in the sense that
     * nothing holds it, and not free in the sense that matters when you ask
     * "can I afford this?". Each account says what share of its spare cash is
     * investing money; that share is excluded here and reported separately.
     */
    accountRows.map((a) => ({
      amount: splitPortfolioCash(a.free, a.portfolioCashPercent ?? null).spendable,
      currency: a.currency,
    })),
    rates,
    base
  ).total;

  const investingCash = sumInBase(
    accountRows.map((a) => ({
      amount: splitPortfolioCash(a.free, a.portfolioCashPercent ?? null).belongsToPortfolio,
      currency: a.currency,
    })),
    rates,
    base
  ).total;

  // Accounts that have never been told which they are. Worth naming: until
  // one is set, its cash is counted as spendable, and that may be wrong.
  const unsetCashShare = accountRows.filter(
    (a) => a.portfolioCashPercent === null && a.free > 0
  ).length;
  const totalAllocated = sumInBase(
    accounts.map((a) => ({ amount: a.allocated, currency: a.currency })),
    rates,
    base
  ).total;

  /**
   * The month's flows, from the month — not from the eight rows shown below.
   *
   * These were filtered out of `recentTx`, which is `listTransactions(8)`: a
   * list built for the "Recent transactions" table at the bottom of the page.
   * So "Net Cash Flow (month)" was the net of at most eight transactions, and
   * the more active the month the more wrong it got — silently, because a
   * plausible small number is exactly what you would expect to see there.
   *
   * `getMonthShape` already reads the whole month and converts every row to the
   * base currency, which the reduce also wasn't doing: transactions carry their
   * own currency and were being added together regardless.
   */
  const income = month.flows.income.total;
  const expenses = month.flows.expenses.total;

  const warnings = accounts.filter((a) => a.state !== "RECONCILED");

  /**
   * The floor under monthly spending. A forecast of charges, NOT money that has
   * moved — it sits beside the cash-flow figure rather than inside it, because
   * the charges themselves already arrive as transactions.
   */
  const subs = await getSubscriptionTotals();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <CurrencySwitch
          favourites={favouriteCurrencies}
          display={base}
          base={storedBase}
          hrefFor={(c) => `/?currency=${c}`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Net Worth"
          value={inDisplay(nw.total)}
          floating={inDisplay(nw.floating)}
          currency={base}
          note={
            nw.portfolio > 0
              ? `cash ${fmt(inDisplay(nw.cash), base)} + investments ${fmt(inDisplay(nw.portfolio), base)}`
              : undefined
          }
          explain={[
            "Everything you own, added once. Bank balances, broker accounts, crypto and manually recorded holdings.",
            "Cash here means anything that holds its value: money in a bank, and also fiat and stablecoins sitting on a platform. Only assets a market can reprice count as investments.",
            "The hard part is counting each euro exactly once: a broker's balance already contains its ETFs, so those are filed under investments rather than added again. That is why cash plus investments equals this figure instead of exceeding it.",
            "The amber figure is how much of it a market can move — the part that could be worth less tomorrow without you doing anything.",
          ]}
        />
        <StatCard
          label="Investments"
          value={inDisplay(nw.portfolio)}
          floating={inDisplay(nw.floating)}
          currency={base}
          explain={[
            "Assets whose price can move: ETFs, shares, crypto, and any part of an account you've told the app is invested.",
            "Euros, dollars and stablecoins are not counted here even when they sit in a broker or an exchange. They hold their value, so they belong with your cash — including collateral sitting free beside an open trade, which is money you still have.",
            "It is not added on top of Net Worth; it is a slice of it. A broker's balance already contains its positions, so this reclassifies that money rather than counting it twice.",
            "The amber figure is the part a market can move — for this card, usually all of it.",
          ]}
        />
        <StatCard
          label="Free Cash"
          value={totalFree}
          currency={base}
          explain={[
            "Money you could spend today without selling anything or breaking a promise to yourself.",
            "Smaller than the cash in Net Worth, and deliberately so: this also takes out what buckets have claimed, what a broker is holding as margin, and the share of each account you've marked as investing money waiting to be used.",
            "If it looks low, the Accounts card below says why, account by account.",
          ]}
          note={
            investingCash > 0
              ? `${fmt(investingCash, base)} more is investing cash`
              : unsetCashShare > 0
                ? `${unsetCashShare} account${unsetCashShare === 1 ? "" : "s"} haven't said if this is investing money`
                : undefined
          }
        />
        <StatCard
          label="Allocated Cash"
          value={inDisplay(totalAllocated)}
          currency={base}
          explain={[
            "Cash you have promised to a bucket — an emergency fund, a trip, a deposit.",
            "Nothing has moved. The money is still in the same account; this only records that it is spoken for, which is why it comes out of Free Cash.",
          ]}
        />
        <StatCard
          label="Net Cash Flow (month)"
          value={inDisplay(income - expenses)}
          currency={base}
          explain={[
            "Income minus expenses since the 1st, from every transaction recorded this month.",
            "Transfers between your own accounts and money moved into investments are left out — neither makes you richer or poorer, and counting them would make a contribution look like a loss.",
            "It does not include gains or losses on what you hold. That is a change in what things are worth, not money arriving.",
          ]}
        />
      </div>

      {subs.activeCount > 0 && (
        <div className="card p-3 text-xs flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[var(--muted)]">
            <span className="text-[var(--foreground)]">{fmt(inDisplay(subs.monthly), base)}</span> a month is
            already committed across {subs.activeCount} subscription
            {subs.activeCount === 1 ? "" : "s"} — {fmt(inDisplay(subs.yearly), base)} a year. Not counted in the
            figures above; those charges arrive as normal transactions.
          </span>
          <Link href="/subscriptions" className="text-[var(--accent)] whitespace-nowrap">
            Review
          </Link>
        </div>
      )}

      {unconverted.length > 0 && (
        <div className="card p-4 border-l-2" style={{ borderLeftColor: "var(--amber)" }}>
          <div className="text-sm">Some balances could not be converted to EUR</div>
          <div className="text-xs text-[var(--muted)] mt-1">
            No exchange rate for {Array.from(new Set(unconverted.map((u) => u.currency))).join(", ")}. Those
            amounts are left out of the totals above rather than counted as if they were euros. Add a rate in{" "}
            <Link href="/settings" className="text-[var(--accent)]">
              Settings
            </Link>
            .
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="text-sm font-medium">Attention</div>
          {warnings.map((a) => (
            <div key={a.id} className="text-sm text-[var(--muted)] flex items-center justify-between">
              <span>
                {a.state === "OVERALLOCATED" ? "⚠️" : "🕒"} {a.name} — {a.state === "OVERALLOCATED" ? `overallocated by €${a.overallocatedBy.toFixed(2)}` : "balance is stale"}
              </span>
              <Link href={`/accounts/${a.id}`} className="text-[var(--accent)] text-xs">
                Reconcile
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Open by default: this is the shape of the whole thing at a glance. */}
      <div className="card p-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm font-medium">Net worth over time</div>
          <Link href="/analytics" className="text-xs text-[var(--accent)]">
            More charts →
          </Link>
        </div>
        {/* The series is stored in the base currency, so every point converts
            with the same helper the cards use — a chart labelled in dollars
            drawing euro values would be the same mislabelling, just harder to
            notice. */}
        <NetWorthChart
          data={netWorthSeries.map((p) => ({ ...p, netWorth: inDisplay(p.netWorth) }))}
          currency={base}
        />
      </div>

      {/* This month, split into what's already decided and what isn't. A single
          expenses figure can't answer "how much of this month is settled?". */}
      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">This month</div>
          <FlowBars
            shape={{
              flows: {
                ...month.flows,
                committedNet: inDisplay(month.flows.committedNet),
                discretionary: inDisplay(month.flows.discretionary),
                income: {
                  ...month.flows.income,
                  total: inDisplay(month.flows.income.total),
                  fixed: inDisplay(month.flows.income.fixed),
                  variable: inDisplay(month.flows.income.variable),
                  unclassified: inDisplay(month.flows.income.unclassified),
                  // A percentage is already unit-free; converting it would be
                  // the bug this whole change is about, in reverse.
                  fixedPercent: month.flows.income.fixedPercent,
                },
                expenses: {
                  ...month.flows.expenses,
                  total: inDisplay(month.flows.expenses.total),
                  fixed: inDisplay(month.flows.expenses.fixed),
                  variable: inDisplay(month.flows.expenses.variable),
                  unclassified: inDisplay(month.flows.expenses.unclassified),
                  fixedPercent: month.flows.expenses.fixedPercent,
                },
              },
              unclassified: month.unclassified.map((u) => ({
                ...u,
                amount: inDisplay(u.amount),
              })),
            }}
            currency={base}
          />
        </div>

        <Section
          title="Goals"
          defaultOpen
          summary={
            <>
              {topBuckets.length} · <Money value={inDisplay(bucketTotalValue)} currency={base} />
            </>
          }
        >
          {topBuckets.length === 0 ? (
            <div className="text-xs text-[var(--muted)] py-4 text-center">
              No buckets yet.{" "}
              <Link href="/buckets" className="text-[var(--accent)]">
                Create one
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {topBuckets.map((b) => (
                <div key={b.id}>
                  <div className="flex justify-between items-baseline text-xs mb-1">
                    <Link href={`/buckets/${b.id}`} className="hover:underline">
                      {b.name}
                    </Link>
                    <span className="text-[var(--muted)]">
                      <Money value={inDisplay(b.totals.total)} currency={base} />
                      {b.progress.percent !== null && ` · ${b.progress.percent.toFixed(0)}%`}
                    </span>
                  </div>
                  {b.progress.percent !== null && (
                    <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden relative">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.min(100, b.progress.percent)}%`,
                          background: b.progress.reached ? "var(--green)" : "var(--accent)",
                        }}
                      />
                      {/* Where the goal stands on guaranteed money alone — a goal
                          funded by an ETF is not the same as one funded by cash. */}
                      {b.progress.conservativePercent !== null &&
                        b.progress.conservativePercent < b.progress.percent && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-[var(--foreground)] opacity-50"
                            style={{ left: `${Math.min(100, b.progress.conservativePercent)}%` }}
                            title={`${b.progress.conservativePercent.toFixed(0)}% guaranteed`}
                          />
                        )}
                    </div>
                  )}
                </div>
              ))}
              <Link href="/buckets" className="text-xs text-[var(--accent)] block pt-1">
                All buckets →
              </Link>
            </div>
          )}
        </Section>
      </div>

      <Section
        title="Where the money is"
        defaultOpen
        summary={
          <>
            {composition.length} accounts
            {totalFloating > 0 && (
              <>
                {" · "}
                <span className="text-[var(--amber)]">
                  <Money value={inDisplay(totalFloating)} currency={base} /> variable
                </span>
              </>
            )}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-6">
          <div>
            <AccountsCard accounts={accountRows} />
          </div>
          <div>
            <DonutChart
              data={composition
                .filter((c) => c.composition.total > 0)
                .map((c) => ({ name: c.name, value: c.composition.total }))}
            />
          </div>
        </div>
      </Section>

      <Section title="Recent transactions" summary={`${recentTx.length} shown`}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {recentTx.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.date).toLocaleDateString("pt-PT")}</td>
                <td>{t.description || t.categoryName || t.type}</td>
                <td>
                  <Money value={Number(t.amount)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Link href="/transactions" className="text-xs text-[var(--accent)] block pt-3">
          All transactions →
        </Link>
      </Section>
    </div>
  );
}

/**
 * `floating` is the market-exposed slice of the value — shown in parentheses so
 * the headline number never hides how much of it isn't guaranteed.
 */
function StatCard({
  label,
  value,
  floating,
  currency = "EUR",
  note,
  explain,
}: {
  label: string;
  value: number;
  floating?: number;
  currency?: string;
  note?: string;
  /** What this figure counts, shown on hover or keyboard focus. */
  explain?: string | string[];
}) {
  const card = (
    <div className="card p-4 h-full">
      <div className="text-xs text-[var(--muted)] mb-1">{label}</div>
      <div className="text-xl font-semibold">
        <Money value={value} currency={currency} />
        {floating !== undefined && floating > 0 && (
          <span className="text-sm font-normal text-[var(--amber)]">
            {" "}
            (<Money value={floating} currency={currency} />)
          </span>
        )}
      </div>
      {floating !== undefined && floating > 0 && (
        <div className="text-[10px] text-[var(--muted)] mt-1">in parentheses: not guaranteed</div>
      )}
      {note && <div className="text-[10px] text-[var(--muted)] mt-1">{note}</div>}
      {explain && (
        <div className="text-[10px] mt-1" style={{ color: "var(--accent)" }}>
          what is this?
        </div>
      )}
    </div>
  );

  if (!explain) return card;
  return (
    <Explain title={label} body={explain}>
      {card}
    </Explain>
  );
}
