import { listBucketsWithTotals, createBucket, addToAllocation } from "@/actions/buckets";
import { getBucketPlan, applyBucketPlan, fitOtherPercentages } from "@/actions/plan";
import { listAccountsWithState } from "@/actions/accounts";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

export default async function BucketsPage() {
  const [buckets, accounts, plan] = await Promise.all([
    listBucketsWithTotals(),
    listAccountsWithState(),
    getBucketPlan(),
  ]);
  const planRow = new Map(plan.rows.map((r) => [r.id, r]));

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Buckets</h1>

      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-1">Add money to a bucket</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          Move some of an account's free cash into a bucket. This doesn't move real money — it just marks it as
          reserved for that purpose.
        </p>
        {buckets.length === 0 || accounts.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            {accounts.length === 0 ? "Create an account first." : "Create a bucket below first."}
          </p>
        ) : (
          <form action={addToAllocation} className="space-y-3">
            <select name="accountId" className="input" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — free: {a.free.toFixed(2)} {a.currency}
                </option>
              ))}
            </select>
            <select name="bucketId" className="input" required>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" placeholder="Amount" className="input" required />
            <button type="submit" className="btn w-full">
              Add to bucket
            </button>

          </form>
        )}
      </div>

      {buckets.length > 0 && (
        <div className="card p-4">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <div className="text-sm font-medium">Allocation plan</div>
              <div className="text-xs text-[var(--muted)] mt-1">
                Give each bucket a share of your money and the app works out where you stand. Available:{" "}
                <Money value={plan.available} currency={plan.baseCurrency} /> · planned{" "}
                <span className={plan.overcommitted ? "text-[var(--red)]" : undefined}>
                  {plan.totalPercent}%
                </span>
                {plan.unplannedPercent > 0 && (
                  <> · <span className="text-[var(--green)]">{plan.unplannedPercent}% still free</span></>
                )}
              </div>
            </div>
            {plan.totalPercent > 0 && !plan.overcommitted && (
              <form action={applyBucketPlan}>
                <button type="submit" className="btn whitespace-nowrap">
                  Apply plan
                </button>
              </form>
            )}
          </div>

          {plan.overcommitted && (
            <div className="mb-3">
              <div className="text-xs text-[var(--red)] mb-2">
                Your percentages add up to {plan.totalPercent}%. Keep one as it is and I&apos;ll fit the others
                around it:
              </div>
              <div className="flex gap-2 flex-wrap">
                {plan.rows
                  .filter((r) => r.targetPercent !== null)
                  .map((r) => (
                    <form action={fitOtherPercentages} key={r.id}>
                      <input type="hidden" name="keepId" value={r.id} />
                      <button type="submit" className="btn py-1 px-3 text-xs">
                        Keep {r.name} at {r.targetPercent}%
                      </button>
                    </form>
                  ))}
              </div>
            </div>
          )}

          {plan.totalPercent === 0 ? (
            <div className="text-xs text-[var(--muted)]">
              No percentages set yet. Add one to a bucket below (e.g. 25% for Emergency, 30% for Travel) and
              this fills in.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table whitespace-nowrap">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th className="text-right">Plan %</th>
                    <th className="text-right">Should hold</th>
                    <th className="text-right">Currently</th>
                    <th className="text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows
                    .filter((r) => r.targetPercent !== null)
                    .map((r) => (
                      <tr key={r.id}>
                        <td>
                          {r.name}
                          {r.goalReached && (
                            <span className="badge ml-2 border border-[var(--green)] text-[var(--green)]">
                              ✓ Goal
                            </span>
                          )}
                        </td>
                        <td className="text-right">{r.targetPercent}%</td>
                        <td className="text-right">
                          <Money value={r.target} currency={plan.baseCurrency} />
                        </td>
                        <td className="text-right">
                          <Money value={r.current} currency={plan.baseCurrency} />
                          <div className="text-xs text-[var(--muted)]">{r.actualPercent}%</div>
                        </td>
                        <td
                          className={`text-right ${
                            Math.abs(r.drift) < 0.01
                              ? "text-[var(--green)]"
                              : r.drift > 0
                                ? "text-[var(--amber)]"
                                : "text-[var(--muted)]"
                          }`}
                        >
                          {Math.abs(r.drift) < 0.01 ? (
                            "on plan"
                          ) : (
                            <>
                              {r.drift > 0 ? "+" : "−"}
                              <Money value={Math.abs(r.drift)} currency={plan.baseCurrency} />
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="text-xs text-[var(--muted)] mt-3">
                &quot;Apply plan&quot; only rewrites which money is earmarked for what. No real money moves —
                the app cannot move money.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {buckets.map((b) => {
          const target = b.targetAmount ? Number(b.targetAmount) : null;
          const pct = target ? Math.min(100, Math.round((b.total / target) * 100)) : null;
          const goalReached = target !== null && b.total >= target;
          const row = planRow.get(b.id);
          return (
            <div key={b.id} className="card p-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Link href={`/buckets/${b.id}`} className="text-sm font-medium hover:underline truncate">
                    {b.name}
                  </Link>
                  {goalReached && (
                    <span className="badge border border-[var(--green)] text-[var(--green)] shrink-0">
                      ✓ Goal reached
                    </span>
                  )}
                </div>
                <div className="text-sm whitespace-nowrap">
                  <Money value={b.total} />
                  {target ? <span className="text-[var(--muted)]"> / <Money value={target} /></span> : null}
                </div>
              </div>
              {pct !== null && (
                <div className="h-1.5 rounded-full bg-[var(--surface-2)] mb-2 overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${pct}%`, background: goalReached ? "var(--green)" : "var(--accent)" }}
                  />
                </div>
              )}
              {row?.targetPercent != null && (
                <div className="text-xs mb-3">
                  <span className="text-[var(--muted)]">
                    plan {row.targetPercent}% → <Money value={row.target} currency={plan.baseCurrency} />
                  </span>{" "}
                  {Math.abs(row.drift) < 0.01 ? (
                    <span className="text-[var(--green)]">on plan</span>
                  ) : row.drift > 0 ? (
                    <span className="text-[var(--amber)]">
                      needs <Money value={row.drift} currency={plan.baseCurrency} />
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">
                      over by <Money value={Math.abs(row.drift)} currency={plan.baseCurrency} />
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-1">
                {b.allocations.map((a) => (
                  <div key={a.id} className="flex justify-between text-xs text-[var(--muted)]">
                    <span>{a.accountName}</span>
                    <Money value={a.amount} />
                  </div>
                ))}
                {b.allocations.length === 0 && (
                  <div className="text-xs text-[var(--muted)]">No money allocated yet.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">Create bucket</div>
        <form action={createBucket} className="space-y-3">
          <input name="name" placeholder="Name (e.g. Emergency Fund)" className="input" required />
          <input name="description" placeholder="Description" className="input" />
          <input name="targetAmount" type="number" step="0.01" placeholder="Target amount (optional)" className="input" />
          <input
            name="targetPercent"
            type="number"
            step="0.01"
            min="0"
            max={plan.unplannedPercent}
            placeholder={`Plan % (up to ${plan.unplannedPercent}% still free)`}
            className="input"
          />
          <button type="submit" className="btn w-full">
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
