import { getAccount, getAccountSnapshots, updateAccountBalance, updateAccount, archiveAccount } from "@/actions/accounts";
import { listBucketsWithTotals, setAllocation } from "@/actions/buckets";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import NetWorthChart from "@/components/NetWorthChart";
import { growthOverDays, growth, type SeriesPoint } from "@/lib/accounting/composition";
import { notFound } from "next/navigation";
import { getAccountPlatformTotals } from "@/actions/connections";
import BalanceMeaningField from "@/components/BalanceMeaningField";
import { meaningOf } from "@/lib/accounting/balanceScope";
import { eligibleCash } from "@/lib/accounting";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const snapshots = await getAccountSnapshots(id);
  const buckets = await listBucketsWithTotals();
  const myAllocations = buckets.flatMap((b) =>
    b.allocations.filter((a) => a.accountId === id).map((a) => ({ ...a, bucketName: b.name }))
  );

  // Both computable from what this page already loads, and both were missing
  // from it — the balance stood without the context that makes it actionable.
  const allocatedTotal =
    Math.round((myAllocations.reduce((sum, a) => sum + Number(a.amount), 0) + Number.EPSILON) * 100) /
    100;
  /**
   * Free means committed to nothing.
   *
   * For a connected account the balance is the platform's total, which includes
   * everything invested — subtracting only bucket allocations from it reported
   * an account that is fully invested as entirely free. The platform's own
   * available figure is the honest starting point.
   *
   * For a manual account it is `eligibleCash`, not the raw balance. This page
   * used to read `account.balance` directly and so knew nothing about an
   * account that is part bank and part broker: a Trade Republic holding €450.83
   * of ETFs and €0.58 of change reported all €451.41 as free. Every other
   * screen was right, because every other screen goes through the shared
   * function — which is the argument for there being only one.
   */
  const platformTotals = await getAccountPlatformTotals();
  const platform = platformTotals.get(id);
  const investedHere =
    meaningOf(account.balanceMeaning) === "bank_and_broker"
      ? Number(account.investedValue ?? 0)
      : null;
  const spendable = platform
    ? platform.available
    : eligibleCash({ id, balance: Number(account.balance), investedValue: investedHere });
  const free = Math.round((spendable - allocatedTotal + Number.EPSILON) * 100) / 100;

  // One point per day the balance was recorded, in the account's own currency —
  // no conversion, because this chart is about one account's own history.
  const series: SeriesPoint[] = [
    ...new Map(
      snapshots
        .map((s) => ({
          date: new Date(s.timestamp).toISOString().slice(0, 10),
          value: Number(s.balance),
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((p) => [p.date, p] as const)
    ).values(),
  ];

  const windows = [
    { label: "30d", days: 30 },
    { label: "90d", days: 90 },
    { label: "1y", days: 365 },
  ].map((w) => ({ label: w.label, growth: growthOverDays(series, w.days) }));

  // Since the beginning is always answerable when there are two points.
  if (series.length >= 2) {
    windows.push({
      label: "all",
      growth: growth({ from: series[0].value, to: series[series.length - 1].value }),
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs text-[var(--muted)]">{account.institution}</div>
          <h1 className="text-lg font-semibold">{account.name}</h1>
          {/* The facts that were only discoverable by scrolling to the edit
              form and reading two unlabelled dropdowns. */}
          <div className="flex gap-1.5 flex-wrap mt-2">
            <span className="badge border border-[var(--border)] text-[var(--muted)] text-[10px]">
              {account.accountType}
            </span>
            <span className="badge border border-[var(--border)] text-[var(--muted)] text-[10px]">
              {account.currency}
            </span>
            {account.portfolioCashPercent !== null && (
              <span
                className="badge border text-[10px]"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                {Number(account.portfolioCashPercent)}% investing cash
              </span>
            )}
          </div>
        </div>
        <form action={archiveAccount}>
          <input type="hidden" name="id" value={account.id} />
          <ConfirmSubmitButton
            label={account.active ? "Archive account" : "Account archived"}
            confirmMessage={`Archive "${account.name}"? Its history stays intact, it just leaves the active lists.`}
          />
        </form>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Current balance</div>
          <div className="text-xl font-semibold">
            <Money value={Number(account.balance)} currency={account.currency} />
          </div>
        </div>
        {/* Free and allocated were computable from this page's data and shown
            nowhere on it, so the balance stood without the context that makes
            it actionable. */}
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Free</div>
          <div className="text-xl font-semibold">
            <Money value={free} currency={account.currency} />
          </div>
          {/* Why it is less than the balance. Without this, "Free 144,84"
              beside "Balance 144,84" on a fully invested account read as a
              claim that none of it was invested. */}
          <div className="text-[10px] text-[var(--muted)] mt-1 leading-snug">
            {platform && (
              <div>{(Number(account.balance) - platform.available).toFixed(2)} invested</div>
            )}
            {/* A declared split, stated in the same place a synced one is. The
                figure was invisible here, so a wrong Free had no explanation
                on screen and no way to be traced to its cause. */}
            {investedHere !== null && investedHere > 0 && (
              <div>{investedHere.toFixed(2)} invested (you told the app)</div>
            )}
            {allocatedTotal > 0 && <div>{allocatedTotal.toFixed(2)} assigned to buckets</div>}
          </div>
          {/* The split was chosen but never filled in: everything then counts
              as spendable, and an account of ETFs looks like ready money. */}
          {meaningOf(account.balanceMeaning) === "bank_and_broker" &&
            account.investedValue === null && (
              <div className="text-[10px] mt-1 leading-snug" style={{ color: "var(--amber)" }}>
                This account is set to hold cash and investments together, but hasn&apos;t said how
                much is invested — so all of it counts as spendable. Fill it in below.
              </div>
            )}
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Last Updated</div>
          <div className="text-sm">
            {account.lastManualUpdate ? new Date(account.lastManualUpdate).toLocaleString("pt-PT") : "never"}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">History points</div>
          <div className="text-sm">{snapshots.length} snapshots</div>
        </div>
      </div>

      {/* Growth over the windows the history can actually support. A window
          longer than the data returns nothing rather than a flattering number. */}
      {series.length >= 2 && (
        <div className="card p-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <div className="text-sm font-medium">How this account has moved</div>
            <div className="flex gap-4 text-xs">
              {windows.map((w) => (
                <span key={w.label}>
                  <span className="text-[var(--muted)]">{w.label} </span>
                  {w.growth === null ? (
                    <span className="text-[var(--muted)]">—</span>
                  ) : (
                    <span
                      style={{
                        color: w.growth.change >= 0 ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {w.growth.change >= 0 ? "+" : "−"}
                      {Math.abs(w.growth.change).toFixed(2)}
                      {w.growth.percent !== null && ` (${w.growth.percent.toFixed(1)}%)`}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
          <NetWorthChart
            data={series.map((p) => ({ date: p.date, netWorth: p.value }))}
            currency={account.currency}
          />
          <p className="text-xs text-[var(--muted)] mt-2">
            Change in balance, not investment return — a deposit shows here as growth because from
            the account&apos;s point of view that&apos;s exactly what it is.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Update balance (reconciliation)</div>
          <form action={updateAccountBalance} className="space-y-3">
            <input type="hidden" name="accountId" value={account.id} />
            <label className="block text-xs">
              <span className="text-[var(--muted)]">What the account really holds now</span>
              <input
                name="newBalance"
                type="number"
                step="0.01"
                placeholder={`e.g. ${Number(account.balance).toFixed(2)}`}
                className="input mt-1"
                required
              />
            </label>
            <label className="block text-xs">
              <span className="text-[var(--muted)]">Record the difference as</span>
            <select name="classification" className="input">
              <option value="interest">Interest</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="correction">Correction (no cash-flow impact)</option>
              <option value="other">Other (no cash-flow impact)</option>
              </select>
            </label>
            <button type="submit" className="btn w-full">
              Save
            </button>
            <p className="text-xs text-[var(--muted)]">
              The difference vs. the current balance is recorded as a transaction of this type (except
              Correction/Other, which just fixes the number without affecting cash flow).
            </p>
          </form>
        </div>

        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Bucket allocations</div>
          <table className="data-table mb-4">
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {myAllocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.bucketName}</td>
                  <td>
                    <Money value={a.amount} currency={account.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={setAllocation} className="space-y-3">
            <input type="hidden" name="accountId" value={account.id} />
            <select name="bucketId" className="input" required>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" placeholder="Amount (0 removes it)" className="input" required />
            <button type="submit" className="btn w-full">
              Set exact total
            </button>
          </form>
        </div>
      </div>

      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-1">Account details</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          Naming and currency. Changing the currency does not convert anything already
          recorded — it only changes how new figures are read.
        </p>
        <form action={updateAccount} className="space-y-3">
          <input type="hidden" name="id" value={account.id} />
          {/* Labelled. Four boxes reading "Trading 212", "Trading 212",
              "Exchange", "USD" gave no clue which was which. */}
          <label className="block text-xs">
            <span className="text-[var(--muted)]">Institution</span>
            <input
              name="institution"
              defaultValue={account.institution}
              className="input mt-1"
              required
            />
          </label>
          <label className="block text-xs">
            <span className="text-[var(--muted)]">Account name</span>
            <input name="name" defaultValue={account.name} className="input mt-1" required />
          </label>
          <label className="block text-xs">
            <span className="text-[var(--muted)]">Type</span>
            <select name="accountType" defaultValue={account.accountType} className="input mt-1">
            <option value="bank">Bank</option>
            <option value="broker">Broker</option>
            <option value="exchange">Exchange</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-[var(--muted)]">Currency</span>
            <select name="currency" defaultValue={account.currency} className="input mt-1">
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </label>
          {/* Missing from this form until now, while the action read it anyway
              — so every save reset the meaning to "idle cash". */}
          <BalanceMeaningField
            defaultMeaning={meaningOf(account.balanceMeaning)}
            defaultInvested={account.investedValue === null ? null : Number(account.investedValue)}
            currency={account.currency}
          />
          {/* Cash in a broker waiting to buy something is free in the sense
              that nothing holds it, and not free in the sense that matters
              before you commit to a purchase. This keeps it out of the
              dashboard's Free Cash without hiding it. */}
          <label className="block text-xs">
            <span className="text-[var(--muted)]">
              How much of this account&apos;s spare cash is investing money?
            </span>
            <div className="flex items-center gap-2 mt-1">
              <input
                name="portfolioCashPercent"
                type="number"
                min="0"
                max="100"
                step="1"
                defaultValue={account.portfolioCashPercent ?? ""}
                placeholder="e.g. 100 for a broker, 0 for a current account"
                className="input"
              />
              <span className="text-[var(--muted)]">%</span>
            </div>
            <span className="text-[10px] text-[var(--muted)] block mt-1">
              Left blank, it counts as spendable and the dashboard says it hasn&apos;t been set.
            </span>
          </label>

          <label className="block text-xs">
            <span className="text-[var(--muted)]">Notes</span>
            <textarea
              name="notes"
              defaultValue={account.notes ?? ""}
              className="input mt-1"
              rows={2}
            />
          </label>
          <button type="submit" className="btn w-full">
            Save changes
          </button>
        </form>
      </div>
    </div>
  );
}
