import { currentLanguage } from "@/actions/language";
import { formatFor } from "@/lib/format";
import RetryableForm from "@/components/RetryableForm";
import { textForRequest } from "@/actions/pageLanguage";
import ResponsiveTable from "@/components/ResponsiveTable";
import {
  listSubscriptions,
  getSubscriptionTotals,
  submitSubscriptionCreation,
  toggleSubscription,
  deleteSubscription,
} from "@/actions/subscriptions";
import { listAccountsWithState } from "@/actions/accounts";
import { listCategories } from "@/actions/transactions";
import { CADENCES } from "@/lib/accounting/subscriptions";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Section from "@/components/Section";
import DonutChart from "@/components/DonutChart";
import DueSubscriptionCharges from "@/components/DueSubscriptionCharges";
import { getDueSubscriptionCharges } from "@/actions/subscriptionCharges";

export default async function SubscriptionsPage() {
  const language = await currentLanguage();
  const { fmt, locale: numberLocale } = formatFor(language);
  const uiText = await textForRequest();
  const [subs, totals, accounts, categories, due] = await Promise.all([
    listSubscriptions(),
    getSubscriptionTotals(),
    listAccountsWithState(),
    listCategories(),
    getDueSubscriptionCharges(),
  ]);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const active = subs.filter((s) => s.active);
  const cancelled = subs.filter((s) => !s.active);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">{uiText("Subscriptions")}</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">{uiText("What leaves every month whether you do anything or not. These are commitments, not transactions — the charges themselves arrive with your statement and are counted there, so nothing on this page is added to your balances or your spending totals.")}</p>
      </div>

      <DueSubscriptionCharges charges={due.charges} accounts={due.accounts} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">{uiText("Committed each month")}</div>
          <div className="text-2xl font-semibold mt-1">
            <Money value={totals.monthly} currency={totals.baseCurrency} />
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {totals.activeCount}{uiText(" active")}{totals.inactiveCount > 0 && ` · ${totals.inactiveCount} cancelled`}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">{uiText("Over a year")}</div>
          <div className="text-2xl font-semibold mt-1">
            <Money value={totals.yearly} currency={totals.baseCurrency} />
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">{uiText("at today's prices")}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">{uiText("Most expensive")}</div>
          <div className="text-2xl font-semibold mt-1"><span translate="no">{active[0]?.name ?? "—"}</span></div>
          {active[0] && (
            <div className="text-xs text-[var(--muted)] mt-1">
              <span translate="no">{fmt(active[0].yearly, active[0].currency)}</span>{uiText(" a year")}</div>
          )}
        </div>
      </div>

      {active.length > 0 && (
        <div className="card p-4">
          <DonutChart compact currency={totals.baseCurrency} data={active.filter((s) => s.monthlyInBase !== null).map((s) => ({ name: s.name, value: Math.round((s.monthlyInBase ?? 0) * 100) / 100 }))} />
        </div>
      )}

      {totals.unconverted.length > 0 && (
        <div className="card p-3 text-xs" style={{ borderColor: "var(--amber)" }}>{uiText("Left out of the totals: ")}{totals.unconverted.join(", ")}{uiText(" — no exchange rate yet. Refresh rates in Settings and these will be included.")}</div>
      )}

      <Section
        title="Active"
        defaultOpen
        essential
        summary={`${active.length} ${active.length === 1 ? "subscription" : "subscriptions"}`}
      >
        {active.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center">{uiText("Nothing here yet. Add the ones you already pay — streaming, storage, software, gym.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>{uiText("Name")}</th>
                  <th className="text-right">{uiText("Each charge")}</th>
                  <th>{uiText("Every")}</th>
                  <th className="text-right">{uiText("Per year")}</th>
                  <th>{uiText("Next charge")}</th>
                  <th>{uiText("Account")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {active.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">
                      <span translate="no">{s.name}</span>
                      {s.categoryName && (
                        <div className="text-[10px] text-[var(--muted)]"><span translate="no">{s.categoryName}</span></div>
                      )}
                    </td>
                    <td className="text-right">
                      <Money value={s.amount} currency={s.currency} />
                    </td>
                    <td className="text-xs text-[var(--muted)]">
                      {uiText(CADENCES.find((c) => c.value === s.cadence)?.label ?? s.cadence)}
                    </td>
                    <td className="text-right">
                      <Money value={s.yearly} currency={s.currency} />
                    </td>
                    <td className="text-xs">
                      {s.nextChargeOn ? (
                        <>
                          {s.nextChargeOn.toLocaleDateString(numberLocale)}
                          {s.daysAway !== null && (
                            <span
                              className={
                                s.daysAway <= 3 ? "text-[var(--amber)] ml-1" : "text-[var(--muted)] ml-1"
                              }
                            >
                              ({s.daysAway === 0 ? uiText("today") : uiText("in {0}d", { "0": s.daysAway })})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="text-xs text-[var(--muted)]"><span translate="no">{s.accountName ?? "—"}</span></td>
                    <td className="text-right">
                      <form action={toggleSubscription}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="active" value="false" />
                        <button type="submit" className="text-xs text-[var(--accent)] hover:underline">{uiText("Cancelled it")}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable></div>
          </div>
        )}
      </Section>

      {cancelled.length > 0 && (
        <Section title="Cancelled" summary={uiText("{0} stopped", { "0": cancelled.length })}>
          <p className="text-xs text-[var(--muted)] mb-3">{uiText("Kept on purpose: this is the record of what you stopped paying, and it's worth re-checking your statement in a month to confirm the charges really stopped.")}</p>
          <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
            <tbody>
              {cancelled.map((s) => (
                <tr key={s.id} style={{ opacity: 0.6 }}>
                  <td><span translate="no">{s.name}</span></td>
                  <td className="text-right">
                    <Money value={s.yearly} currency={s.currency} />{uiText(" / year saved")}</td>
                  <td className="text-right">
                    <form action={toggleSubscription}>
                      <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="active" value="true" />
                      <button type="submit" className="text-xs text-[var(--accent)] hover:underline">{uiText("Resume")}</button>
                    </form>
                  </td>
                  <td className="text-right">
                    <form action={deleteSubscription}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmitButton
                        label={uiText("Delete")}
                        confirmMessage={`Delete "${s.name}" entirely? The record that you used to pay it goes too.`}
                      />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable></div>
        </Section>
      )}

      <Section title="Add a subscription" defaultOpen className="max-w-2xl">
        <RetryableForm action={submitSubscriptionCreation} fieldsClassName="space-y-3">
          <input name="name" placeholder={uiText("Name (e.g. Netflix)")} className="input" required />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder={uiText("Amount per charge")}
              className="input"
              required
            />
            <select name="currency" className="input" defaultValue={totals.baseCurrency}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <select name="cadence" className="input" defaultValue="monthly">
              {CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {uiText(c.label ?? "")}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select name="accountId" className="input" defaultValue="">
              <option value="">{uiText("Account — optional")}</option>
              {accounts.map((a) => (
                <option translate="no" key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="categoryId" className="input" defaultValue="">
              <option value="">{uiText("Category — optional")}</option>
              {expenseCategories.map((c) => (
                <option translate="no" key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="nextChargeAt" type="date" className="input" />
          </div>

          <input name="notes" placeholder={uiText("Notes — optional")} className="input" />

          <button type="submit" className="btn w-full">{uiText("Add")}</button>
          <p className="text-xs text-[var(--muted)]">{uiText("The date is the next time you expect to be charged. It rolls forward on its own, so you set it once — leave it blank if you don't know and the cost still counts.")}</p>
        </RetryableForm>
      </Section>
    </div>
  );
}
