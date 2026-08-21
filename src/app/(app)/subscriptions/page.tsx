import {
  listSubscriptions,
  getSubscriptionTotals,
  createSubscription,
  toggleSubscription,
  deleteSubscription,
} from "@/actions/subscriptions";
import { listAccountsWithState } from "@/actions/accounts";
import { listCategories } from "@/actions/transactions";
import { CADENCES } from "@/lib/accounting/subscriptions";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { fmt } from "@/lib/format";

export default async function SubscriptionsPage() {
  const [subs, totals, accounts, categories] = await Promise.all([
    listSubscriptions(),
    getSubscriptionTotals(),
    listAccountsWithState(),
    listCategories(),
  ]);

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const active = subs.filter((s) => s.active);
  const cancelled = subs.filter((s) => !s.active);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Subscriptions</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
          What leaves every month whether you do anything or not. These are commitments, not
          transactions — the charges themselves arrive with your statement and are counted there, so
          nothing on this page is added to your balances or your spending totals.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">Committed each month</div>
          <div className="text-2xl font-semibold mt-1">
            <Money value={totals.monthly} currency={totals.baseCurrency} />
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {totals.activeCount} active
            {totals.inactiveCount > 0 && ` · ${totals.inactiveCount} cancelled`}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">Over a year</div>
          <div className="text-2xl font-semibold mt-1">
            <Money value={totals.yearly} currency={totals.baseCurrency} />
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">at today&apos;s prices</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">Most expensive</div>
          <div className="text-2xl font-semibold mt-1">{active[0]?.name ?? "—"}</div>
          {active[0] && (
            <div className="text-xs text-[var(--muted)] mt-1">
              {fmt(active[0].yearly, active[0].currency)} a year
            </div>
          )}
        </div>
      </div>

      {totals.unconverted.length > 0 && (
        <div className="card p-3 text-xs" style={{ borderColor: "var(--amber)" }}>
          Left out of the totals: {totals.unconverted.join(", ")} — no exchange rate yet. Refresh rates
          in Settings and these will be included.
        </div>
      )}

      <div className="card p-4">
        <div className="text-sm font-medium mb-3">Active</div>
        {active.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center">
            Nothing here yet. Add the ones you already pay — streaming, storage, software, gym.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="text-right">Each charge</th>
                  <th>Every</th>
                  <th className="text-right">Per year</th>
                  <th>Next charge</th>
                  <th>Account</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {active.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">
                      {s.name}
                      {s.categoryName && (
                        <div className="text-[10px] text-[var(--muted)]">{s.categoryName}</div>
                      )}
                    </td>
                    <td className="text-right">
                      <Money value={s.amount} currency={s.currency} />
                    </td>
                    <td className="text-xs text-[var(--muted)]">
                      {CADENCES.find((c) => c.value === s.cadence)?.label ?? s.cadence}
                    </td>
                    <td className="text-right">
                      <Money value={s.yearly} currency={s.currency} />
                    </td>
                    <td className="text-xs">
                      {s.nextChargeOn ? (
                        <>
                          {s.nextChargeOn.toLocaleDateString("pt-PT")}
                          {s.daysAway !== null && (
                            <span
                              className={
                                s.daysAway <= 3 ? "text-[var(--amber)] ml-1" : "text-[var(--muted)] ml-1"
                              }
                            >
                              ({s.daysAway === 0 ? "today" : `in ${s.daysAway}d`})
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="text-xs text-[var(--muted)]">{s.accountName ?? "—"}</td>
                    <td className="text-right">
                      <form action={toggleSubscription}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
                          Cancelled it
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cancelled.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-1 text-[var(--muted)]">Cancelled</div>
          <p className="text-xs text-[var(--muted)] mb-3">
            Kept on purpose: this is the record of what you stopped paying, and it&apos;s worth
            re-checking your statement in a month to confirm the charges really stopped.
          </p>
          <table className="data-table whitespace-nowrap">
            <tbody>
              {cancelled.map((s) => (
                <tr key={s.id} style={{ opacity: 0.6 }}>
                  <td>{s.name}</td>
                  <td className="text-right">
                    <Money value={s.yearly} currency={s.currency} /> / year saved
                  </td>
                  <td className="text-right">
                    <form action={toggleSubscription}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
                        Resume
                      </button>
                    </form>
                  </td>
                  <td className="text-right">
                    <form action={deleteSubscription}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmitButton
                        label="Delete"
                        confirmMessage={`Delete "${s.name}" entirely? The record that you used to pay it goes too.`}
                      />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card p-4 max-w-2xl">
        <div className="text-sm font-medium mb-3">Add a subscription</div>
        <form action={createSubscription} className="space-y-3">
          <input name="name" placeholder="Name (e.g. Netflix)" className="input" required />

          <div className="grid grid-cols-3 gap-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Amount per charge"
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
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <select name="accountId" className="input" defaultValue="">
              <option value="">Account — optional</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select name="categoryId" className="input" defaultValue="">
              <option value="">Category — optional</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="nextChargeAt" type="date" className="input" />
          </div>

          <input name="notes" placeholder="Notes — optional" className="input" />

          <button type="submit" className="btn w-full">
            Add
          </button>
          <p className="text-xs text-[var(--muted)]">
            The date is the next time you expect to be charged. It rolls forward on its own, so you set
            it once — leave it blank if you don&apos;t know and the cost still counts.
          </p>
        </form>
      </div>
    </div>
  );
}
