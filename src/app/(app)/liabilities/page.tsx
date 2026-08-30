import {
  listLiabilities,
  createLiability,
  updateLiability,
  deleteLiability,
} from "@/actions/liabilities";
import { getNetWorth } from "@/actions/networth";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { describeMonths, liabilityLabel } from "@/lib/accounting/liabilities";
import { fmt } from "@/lib/format";

/**
 * What you owe.
 *
 * Net worth is assets minus liabilities and this app only ever did the first
 * half, so anyone with a mortgage was shown a patrimony that did not exist.
 * This page is the other half.
 */
export default async function LiabilitiesPage() {
  const [data, netWorth] = await Promise.all([listLiabilities(), getNetWorth()]);
  const base = data.baseCurrency;

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold">What you owe</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
          Mortgages, loans and card balances. Net worth is what you have minus
          what you owe — without these, the figure on your dashboard is only the
          first half of the sum.
        </p>
      </div>

      {/* ---- The sum, stated so it can be checked ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Assets</div>
          <div className="text-xl font-semibold truncate">
            <Money value={netWorth.assets} currency={base} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">everything you hold</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Owed</div>
          <div className="text-xl font-semibold truncate" style={{ color: "var(--red)" }}>
            <Money value={netWorth.liabilities} currency={base} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">
            {data.items.some((i) => i.accountId !== null)
              ? "excludes debts an account already shows"
              : "subtracted from net worth"}
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Net worth</div>
          <div
            className="text-xl font-semibold truncate"
            style={{ color: netWorth.total >= 0 ? "var(--green)" : "var(--red)" }}
          >
            <Money value={netWorth.total} currency={base} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">assets − owed</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-[var(--muted)] mb-1">Interest per month</div>
          <div className="text-xl font-semibold truncate" style={{ color: "var(--amber)" }}>
            {data.monthlyInterestTotal > 0 ? (
              <Money value={data.monthlyInterestTotal} currency={base} />
            ) : (
              <span className="text-[var(--muted)]">—</span>
            )}
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">
            what owing costs before repaying a cent
          </div>
        </div>
      </div>

      {data.unconverted > 0 && (
        <div className="text-xs" style={{ color: "var(--amber)" }}>
          {data.unconverted} debt{data.unconverted === 1 ? "" : "s"} left out of the totals: no
          exchange rate available for its currency. Nothing has been counted as zero.
        </div>
      )}

      {/* ---- The list ---- */}
      {data.items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          Nothing recorded. If you have no debts, that is the right answer and there is
          nothing to do here.
        </div>
      ) : (
        <div className="card p-4">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Debt</th>
                  <th className="text-right">Owed</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Monthly</th>
                  <th className="text-right">Interest / month</th>
                  <th>Clear in</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-[10px] text-[var(--muted)]">
                        {liabilityLabel(l.kind)}
                        {/* A debt already inside an account balance is shown but
                            never subtracted again — the same rule holdings use. */}
                        {l.accountName && (
                          <span
                            className="ml-1"
                            title="This account's balance is already negative by this amount, so it is counted once, there."
                          >
                            · in {l.accountName}
                          </span>
                        )}
                      </div>
                    </td>
                    {/*
                      Editable in place, because this is the field that changes:
                      a mortgage falls every month, and a debt you can only fix
                      by deleting and retyping is one that quietly goes stale.
                    */}
                    <td className="text-right">
                      <form action={updateLiability} className="flex items-center gap-1 justify-end">
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="apr" value={l.apr ?? ""} />
                        <input type="hidden" name="monthlyPayment" value={l.monthlyPayment ?? ""} />
                        <input type="hidden" name="accountId" value={l.accountId ?? ""} />
                        <input
                          name="balance"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={l.balance}
                          className="input input-narrow text-xs py-1 w-24 text-right"
                          aria-label={`Amount still owed on ${l.name}`}
                        />
                        <button type="submit" className="text-[10px]" style={{ color: "var(--accent)" }}>
                          Save
                        </button>
                      </form>
                      <div className="text-[10px] text-[var(--muted)] mt-0.5">{l.currency}</div>
                    </td>
                    <td className="text-right text-[var(--muted)]">
                      {l.apr === null ? "—" : `${l.apr}%`}
                    </td>
                    <td className="text-right text-[var(--muted)]">
                      {l.monthlyPayment === null ? (
                        "—"
                      ) : (
                        <Money value={l.monthlyPayment} currency={l.currency} />
                      )}
                    </td>
                    <td className="text-right" style={{ color: "var(--amber)" }}>
                      {/* Null, not zero: a debt with no rate recorded is not an
                          interest-free debt. */}
                      {l.monthlyInterest === null ? (
                        <span className="text-[var(--muted)]" title="No rate recorded">
                          rate not set
                        </span>
                      ) : (
                        <Money value={l.monthlyInterest} currency={l.currency} />
                      )}
                    </td>
                    <td className="text-xs">
                      {l.monthlyPayment === null ? (
                        <span className="text-[var(--muted)]">no payment set</span>
                      ) : l.payoffMonths === null ? (
                        <span style={{ color: "var(--red)" }} title="The payment does not cover the interest, so the balance never falls.">
                          never at this payment
                        </span>
                      ) : (
                        <span className="text-[var(--muted)]">{describeMonths(l.payoffMonths)}</span>
                      )}
                    </td>
                    <td className="text-right">
                      <form action={deleteLiability}>
                        <input type="hidden" name="id" value={l.id} />
                        <ConfirmSubmitButton
                          label="Delete"
                          confirmMessage={`Remove "${l.name}"? Your net worth will go up by ${fmt(
                            l.balanceInBase ?? 0,
                            base
                          )}, so only do this if the debt is actually gone.`}
                        />
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Adding one ---- */}
      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-1">Record a debt</div>
        <p className="text-xs text-[var(--muted)] mb-4">
          The rate and monthly payment are optional, but without them the app
          cannot tell you what the debt costs or when it ends.
        </p>

        <form action={createLiability} className="space-y-3">
          <input name="name" placeholder="Name, e.g. Mortgage" className="input" required />

          <div className="flex gap-2">
            <select name="kind" className="input" defaultValue="other">
              {data.kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              name="currency"
              placeholder="EUR"
              defaultValue={base}
              className="input input-narrow"
              maxLength={3}
            />
          </div>

          <div className="flex gap-2">
            <input
              name="balance"
              type="number"
              step="0.01"
              min="0"
              placeholder="Still owed"
              className="input"
              required
            />
            <input
              name="apr"
              type="number"
              step="0.001"
              min="0"
              placeholder="Rate % a year"
              className="input"
            />
          </div>

          <input
            name="monthlyPayment"
            type="number"
            step="0.01"
            min="0"
            placeholder="Monthly payment"
            className="input"
          />

          {/*
            The double-count guard. A credit card kept as an account with a
            negative balance has already reduced net worth once; saying so here
            stops it being subtracted twice.
          */}
          <label className="block">
            <span className="text-xs text-[var(--muted)]">
              Is this already a negative balance on an account?
            </span>
            <select name="accountId" className="input mt-1" defaultValue="">
              <option value="">No — subtract it from my net worth</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  Yes, it&apos;s {a.name}&apos;s balance — count it once, there
                </option>
              ))}
            </select>
          </label>

          <input name="notes" placeholder="Notes (optional)" className="input" />

          <button type="submit" className="btn w-full">
            Record it
          </button>
        </form>
      </div>

      <div className="card p-4 max-w-lg text-xs text-[var(--muted)]">
        <div className="text-[var(--foreground)] font-medium mb-1">
          Why a debt can be entered twice, and how this stops it
        </div>
        <p>
          Accounts here may go negative, because credit cards and overdrafts
          genuinely do. When they do, that balance has already come off your net
          worth. Recording the same debt again would take it off twice — so a
          debt that lives on an account is marked as such, shown in this list,
          and subtracted only once.
        </p>
      </div>
    </div>
  );
}
