import { currentLanguage } from "@/actions/language";
import { formatFor } from "@/lib/format";
import { textForRequest } from "@/actions/pageLanguage";
import ResponsiveTable from "@/components/ResponsiveTable";
import { db } from "@/db/client";
import { interestPayments, accounts } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { submitInterestPayment } from "@/actions/transactions";
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
import Section from "@/components/Section";
import { localDay } from "@/lib/calendar/localDay";

export default async function InterestPage() {
  const language = await currentLanguage();
  const { locale: numberLocale } = formatFor(language);
  const uiText = await textForRequest();
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
  const today = localDay();

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
      <h1 className="text-lg font-semibold">{uiText("Accounts")}</h1>
      <PageTabs tabs={ACCOUNTS_TABS} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">{uiText("This year")}</div>
          <div className="text-xl font-semibold">
            <Money value={ytd} currency={base} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">{uiText("All time")}</div>
          <div className="text-xl font-semibold">
            <Money value={total} currency={base} />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">{uiText("By platform")}</div>
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
        <Section
          title="Accruing right now"
          defaultOpen
          essential
          summary={`${outlook.length} ${outlook.length === 1 ? "account" : "accounts"}`}
        >
          <p className="text-xs text-[var(--muted)] mb-3 max-w-2xl">{uiText("Worked out from each account's rate and the days since it was last paid. Simple accrual on the current balance — if the balance moved during the period, the real figure differs.")}</p>
          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>{uiText("Account")}</th>
                  <th className="text-right">{uiText("Rate")}</th>
                  <th className="text-right">{uiText("Per day")}</th>
                  <th className="text-right">{uiText("Days")}</th>
                  <th className="text-right">{uiText("Owed to you")}</th>
                </tr>
              </thead>
              <tbody>
                {outlook.map((o) => (
                  <tr key={o.accountId}>
                    <td className="font-medium">
                      <span translate="no">{o.name}</span>
                      <div className="text-[10px] text-[var(--muted)]">{uiText("since")}{" "}
                        {o.lastPaid
                          ? o.lastPaid.toLocaleDateString(numberLocale)
                          : uiText("the account was created")}
                      </div>
                    </td>
                    <td className="text-right">
                      {o.apr}%
                      <div className="text-[10px] text-[var(--muted)]">
                        {o.effectiveMonthly}{uiText("% if paid monthly")}</div>
                    </td>
                    <td className="text-right text-[var(--muted)]">
                      {o.perDay.toFixed(4)} {o.currency}
                    </td>
                    <td className="text-right text-[var(--muted)]">{o.accrual.days}</td>
                    <td className="text-right font-medium">
                      <Money value={o.accrual.net} currency={o.currency} />
                      {o.accrual.tax > 0 && (
                        <div className="text-[10px] text-[var(--muted)]">
                          {o.accrual.gross.toFixed(2)}{uiText(" before ")}{o.withholding}{uiText("% tax")}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable></div>
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section title="Record interest payment" defaultOpen>
          <InterestForm
            accounts={rateAccounts}
            action={submitInterestPayment}
            today={today}
          />
        </Section>

        <Section title="Set an account's rate" defaultOpen>
          <p className="text-xs text-[var(--muted)] mb-3">{uiText("With a rate set, the amount above fills itself in and you can tell whether what arrived matches what was owed.")}</p>
          <form action={setAccountRate} className="space-y-3">
            <select name="accountId" className="input" required>
              {accountList.map((a) => (
                <option translate="no" key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="text-[var(--muted)]">{uiText("Annual rate %")}</span>
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
                <span className="text-[var(--muted)]">{uiText("Days in a year")}</span>
                <select name="dayCount" className="input mt-1" defaultValue="365">
                  {DAY_COUNTS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {uiText(d.label ?? "")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-xs block">
              <span className="text-[var(--muted)]">{uiText("Tax withheld at source %")}</span>
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
            <button type="submit" className="btn w-full">{uiText("Save rate")}</button>
            <p className="text-xs text-[var(--muted)]">{uiText("Many countries withhold tax on interest before it reaches you, which is why the gross figure won't match your statement. Use your own rate — leave it blank if none applies. If the computed figure is consistently a little under what you receive, try ACT/360: it pays about 1.4% more for the same rate.")}</p>
          </form>
        </Section>
      </div>

      {unconvertible > 0 && (
        <div className="text-xs" style={{ color: "var(--amber)" }}>
          {unconvertible}{uiText(" payment")}{unconvertible === 1 ? uiText(" is") : uiText("s are")}{uiText(" in a currency with no exchange rate, so ")}{unconvertible === 1 ? uiText("it is") : uiText("they are")}{uiText(" left out of the totals above rather than added unconverted.")}</div>
      )}

      <Section title="Payments received" defaultOpen>
        <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table">
          <thead>
            <tr>
              <th>{uiText("Date")}</th>
              <th>{uiText("Account")}</th>
              <th>{uiText("Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.date).toLocaleDateString(numberLocale)}</td>
                <td><span translate="no">{p.accountName}</span></td>
                <td>
                  <Money value={Number(p.amount)} />
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable></div>
      </Section>
    </div>
  );
}
