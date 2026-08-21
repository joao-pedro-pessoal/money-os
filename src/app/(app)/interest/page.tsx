import { db } from "@/db/client";
import { interestPayments, accounts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { createInterestPayment } from "@/actions/transactions";
import { listAccountsWithState } from "@/actions/accounts";
import { getInterestOutlook, setAccountRate } from "@/actions/interest";
import { Money } from "@/components/PrivacyContext";
import PageTabs from "@/components/PageTabs";
import InterestForm, { type RateAccount } from "@/components/InterestForm";
import { DAY_COUNTS } from "@/lib/accounting/interest";
import { ACCOUNTS_TABS } from "@/lib/navigation";
import { getRates } from "@/actions/fx";
import { getBaseCurrency } from "@/actions/settings";
import { toBase } from "@/lib/fx";

export default async function InterestPage() {
  const payments = await db
    .select({
      id: interestPayments.id,
      amount: interestPayments.amount,
      date: interestPayments.date,
      accountName: accounts.name,
      /**
       * Interest is paid in the account's currency; the table stores no
       * currency of its own. Without this the totals below added dollars to
       * euros and showed the result in whichever symbol the page happened to
       * use.
       */
      accountCurrency: accounts.currency,
    })
    .from(interestPayments)
    .leftJoin(accounts, eq(interestPayments.accountId, accounts.id))
    .orderBy(desc(interestPayments.date));

  const [rates, base] = await Promise.all([getRates(), getBaseCurrency()]);
  /**
   * Converted once, up front.
   *
   * Each payment gets a base-currency figure or null, and every total below
   * reads from the same list. Converting inside the reducers meant the same row
   * was converted three times and a counter was incremented during render —
   * which is both wasteful and the kind of hidden state that stops being
   * correct the moment someone reorders the page.
   */
  const converted = payments.map((p) => ({
    ...p,
    date: p.date,
    inBase: toBase(Number(p.amount), p.accountCurrency ?? base, rates, base),
  }));

  /** Left out of the totals rather than added unconverted. */
  const unconvertible = converted.filter((p) => p.inBase === null).length;
  const usable = converted.filter(
    (p): p is typeof p & { inBase: number } => p.inBase !== null
  );

  const accountList = await listAccountsWithState();
  const today = new Date().toISOString().slice(0, 10);

  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const ytd = usable
    .filter((p) => new Date(p.date) >= yearStart)
    .reduce((s, p) => s + p.inBase, 0);
  const total = usable.reduce((s, p) => s + p.inBase, 0);

  const byAccount = new Map<string, number>();
  for (const p of usable) {
    const name = p.accountName ?? "?";
    byAccount.set(name, (byAccount.get(name) ?? 0) + p.inBase);
  }

  const outlook = await getInterestOutlook();
  const outlookById = new Map(outlook.map((o) => [o.accountId, o]));

  // Every account can receive a payment; the ones with a rate get the figure
  // filled in for them.
  const rateAccounts: RateAccount[] = accountList.map((a) => {
    const o = outlookById.get(a.id);
    return {
      id: a.id,
      name: a.name,
      currency: a.currency,
      balance: a.balance,
      apr: o?.apr ?? null,
      dayCount: o?.dayCount ?? 365,
      withholding: o?.withholding ?? 0,
      since: (o?.since ?? new Date(a.createdAt)).toISOString().slice(0, 10),
    };
  });

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Accounts</h1>
      <PageTabs tabs={ACCOUNTS_TABS} />

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">This year</div>
          <div className="text-xl font-semibold">
            <Money value={ytd} currency={base} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">All time</div>
          <div className="text-xl font-semibold">
            <Money value={total} currency={base} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">By platform</div>
          <div className="space-y-1 text-sm">
            {[...byAccount.entries()].map(([name, amt]) => (
              <div key={name} className="flex justify-between">
                <span className="text-[var(--muted)]">{name}</span>
                <Money value={amt} currency={base} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* What the rates say should have arrived by now. This is the part that
          turns a list of payments into something that can catch a mistake. */}
      {outlook.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-1">Accruing right now</div>
          <p className="text-xs text-[var(--muted)] mb-3 max-w-2xl">
            Worked out from each account&apos;s rate and the days since it was last paid. Simple
            accrual on the current balance — if the balance moved during the period, the real figure
            differs.
          </p>
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Per day</th>
                  <th className="text-right">Days</th>
                  <th className="text-right">Owed to you</th>
                </tr>
              </thead>
              <tbody>
                {outlook.map((o) => (
                  <tr key={o.accountId}>
                    <td className="font-medium">
                      {o.name}
                      <div className="text-[10px] text-[var(--muted)]">
                        since{" "}
                        {o.lastPaid
                          ? o.lastPaid.toLocaleDateString("pt-PT")
                          : "the account was created"}
                      </div>
                    </td>
                    <td className="text-right">
                      {o.apr}%
                      <div className="text-[10px] text-[var(--muted)]">
                        {o.effectiveMonthly}% if paid monthly
                      </div>
                    </td>
                    <td className="text-right text-[var(--muted)]">
                      {o.perDay.toFixed(4)} {o.currency}
                    </td>
                    <td className="text-right text-[var(--muted)]">{o.accrual.days}</td>
                    <td className="text-right font-medium">
                      <Money value={o.accrual.net} currency={o.currency} />
                      {o.accrual.tax > 0 && (
                        <div className="text-[10px] text-[var(--muted)]">
                          {o.accrual.gross.toFixed(2)} before {o.withholding}% tax
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Record interest payment</div>
          <InterestForm
            accounts={rateAccounts}
            action={createInterestPayment}
            today={today}
          />
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-1">Set an account&apos;s rate</div>
          <p className="text-xs text-[var(--muted)] mb-3">
            With a rate set, the amount above fills itself in and you can tell whether what arrived
            matches what was owed.
          </p>
          <form action={setAccountRate} className="space-y-3">
            <select name="accountId" className="input" required>
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="text-[var(--muted)]">Annual rate %</span>
                <input
                  name="apr"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="2.5"
                  className="input mt-1"
                />
              </label>
              <label className="text-xs">
                <span className="text-[var(--muted)]">Days in a year</span>
                <select name="dayCount" className="input mt-1" defaultValue="365">
                  {DAY_COUNTS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-xs block">
              <span className="text-[var(--muted)]">Tax withheld at source %</span>
              <input
                name="withholding"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="0"
                className="input mt-1"
              />
            </label>
            <button type="submit" className="btn w-full">
              Save rate
            </button>
            <p className="text-xs text-[var(--muted)]">
              Many countries withhold tax on interest before it reaches you, which is why the gross
              figure won&apos;t match your statement. Use your own rate — leave it blank if none
              applies. If the computed figure is consistently a little under what you receive, try
              ACT/360: it pays about 1.4% more for the same rate.
            </p>
          </form>
        </div>
      </div>

      {unconvertible > 0 && (
        <div className="text-xs" style={{ color: "var(--amber)" }}>
          {unconvertible} payment{unconvertible === 1 ? " is" : "s are"} in a currency with no
          exchange rate, so {unconvertible === 1 ? "it is" : "they are"} left out of the totals
          above rather than added unconverted.
        </div>
      )}

      <div className="card p-4">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.date).toLocaleDateString("pt-PT")}</td>
                <td>{p.accountName}</td>
                <td>
                  <Money value={Number(p.amount)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
