import { listBucketsWithTotals, createBucket, addToAllocation } from "@/actions/buckets";
import { listAccountsWithState } from "@/actions/accounts";
import { listPurposes } from "@/actions/purpose";
import {
  listGoalsByPriority,
  moveGoal,
  applyDistribution,
  getDefaultShares,
  setPriority,
} from "@/actions/distribute";
import { Money } from "@/components/PrivacyContext";
import Distributor from "@/components/Distributor";
import Link from "next/link";

export default async function BucketsPage() {
  const [buckets, accounts, withInvestments, ranked, defaultShares] = await Promise.all([
    listBucketsWithTotals(),
    listAccountsWithState(),
    listPurposes(),
    listGoalsByPriority(),
    getDefaultShares(),
  ]);

  const base = withInvestments.baseCurrency;
  // Where the money actually is, as opposed to where a plan said it should be.
  const shareOfTotal = new Map(withInvestments.purposes.map((p) => [p.id, p.sharePercent]));

  const shareOf = new Map(defaultShares.map((s) => [s.id, s.percent]));

  // Free cash only: the rest is already promised to other goals, and offering
  // to distribute it would allocate the same money twice.
  const distributable = accounts.reduce((s, a) => s + Math.max(0, a.free), 0);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">Buckets</h1>

      {/* The hierarchy, and the thing that makes it worth having. */}
      <div className="card p-4">
        <div className="text-sm font-medium mb-1">Distribute money</div>
        <Distributor
          available={distributable}
          currency={base}
          defaultShares={defaultShares}
          applyAction={applyDistribution}
        />
      </div>

      {ranked.length > 1 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-1">Priority</div>
          <p className="text-xs text-[var(--muted)] mb-3">
            Money is shared out in this order, with the higher ranks getting more. Two goals on the
            same rank get the same share — set them to the same number to say &quot;these matter
            equally&quot;.
          </p>
          <ul className="space-y-1">
            {ranked.map((g) => {
              const short = g.target === null ? null : Math.max(0, g.target - g.current);
              // Ties are a feature, so they have to be visible: the rank number
              // repeats rather than counting 1,2,3 down the list.
              const tied = ranked.filter((x) => x.priority === g.priority).length > 1;
              const rank = ranked.filter((x) => x.priority < g.priority).length + 1;
              return (
                <li key={g.id} className="flex items-center gap-2 text-sm py-1">
                  <span
                    className="text-xs w-5"
                    style={{ color: tied ? "var(--accent)" : "var(--muted)" }}
                    title={tied ? "Shares this rank with another goal" : undefined}
                  >
                    {rank}
                  </span>
                  <Link href={`/buckets/${g.id}`} className="flex-1 truncate hover:underline">
                    {g.name}
                  </Link>
                  <span className="text-[10px] text-[var(--accent)] whitespace-nowrap w-12 text-right">
                    {shareOf.get(g.id)?.toFixed(1) ?? "0"}%
                  </span>
                  <span className="text-xs text-[var(--muted)] whitespace-nowrap">
                    {short === null ? (
                      "no target"
                    ) : short === 0 ? (
                      <span className="text-[var(--green)]">full</span>
                    ) : (
                      <>
                        <Money value={short} currency={base} /> to go
                      </>
                    )}
                  </span>
                  {/* Direct entry as well as arrows: setting two goals to the
                      same number is how you create a tie, and nudging can only
                      ever pass through one. */}
                  <form action={setPriority} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={g.id} />
                    <input
                      name="priority"
                      type="number"
                      min="0"
                      defaultValue={g.priority}
                      className="input input-narrow text-xs py-0.5 w-14"
                      title="Rank — lower is more important. Equal numbers share equally."
                    />
                    <button type="submit" className="text-[10px] text-[var(--accent)] hover:underline">
                      Set
                    </button>
                  </form>
                  <div className="flex gap-1">
                    <form action={moveGoal}>
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={g.priority === 0}
                        className="text-xs px-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                        style={g.priority === 0 ? { opacity: 0.3 } : undefined}
                        aria-label={`Move ${g.name} up`}
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveGoal}>
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="direction" value="down" />
                      <button
                        type="submit"
                        className="text-xs px-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                        aria-label={`Move ${g.name} down`}
                      >
                        ↓
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* A goal made of cash AND investments. The two progress figures exist
          because "100% funded" by an ETF and by cash are not the same claim. */}
      {withInvestments.purposes.some((p) => p.totals.invested > 0) && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-1">Including investments</div>
          <p className="text-xs text-[var(--muted)] mb-3 max-w-2xl">
            Positions you&apos;ve assigned to a goal, counted at their current market value. The
            conservative figure ignores everything exposed to the market, so you can see how much of
            each goal survives a bad month.
          </p>
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>Goal</th>
                  <th className="text-right">Cash</th>
                  <th className="text-right">Invested</th>
                  {/* `investedPnl` is the unrealised gain on the invested
                      share — profit a price move can take back, not money
                      banked towards the goal. */}
                  <th className="text-right">Unrealized P&amp;L</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Progress</th>
                </tr>
              </thead>
              <tbody>
                {withInvestments.purposes
                  .filter((p) => p.totals.invested > 0)
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.name}</td>
                      <td className="text-right">
                        <Money value={p.totals.cash} currency={withInvestments.baseCurrency} />
                      </td>
                      <td className="text-right">
                        <Money value={p.totals.invested} currency={withInvestments.baseCurrency} />
                      </td>
                      <td
                        className="text-right"
                        style={{
                          color: p.totals.investedPnl >= 0 ? "var(--green)" : "var(--red)",
                        }}
                      >
                        {p.totals.investedPnl >= 0 ? "+" : "−"}
                        <Money
                          value={Math.abs(p.totals.investedPnl)}
                          currency={withInvestments.baseCurrency}
                        />
                      </td>
                      <td className="text-right font-medium">
                        <Money value={p.totals.total} currency={withInvestments.baseCurrency} />
                      </td>
                      <td className="text-right text-xs">
                        {p.progress.percent === null ? (
                          <span className="text-[var(--muted)]">no target</span>
                        ) : (
                          <>
                            {p.progress.percent.toFixed(0)}%
                            <div className="text-[10px] text-[var(--muted)]">
                              {p.progress.conservativePercent?.toFixed(0)}% guaranteed
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-4 max-w-lg">
        <div className="text-sm font-medium mb-1">Add money to a bucket</div>
        <p className="text-xs text-[var(--muted)] mb-3">
          Move some of an account&apos;s free cash into a bucket. This doesn&apos;t move real money — it just marks it as
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


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {buckets.map((b) => {
          const target = b.targetAmount ? Number(b.targetAmount) : null;
          const pct = target ? Math.min(100, Math.round((b.total / target) * 100)) : null;
          const goalReached = target !== null && b.total >= target;
          const share = shareOfTotal.get(b.id) ?? 0;
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
                <div className="text-sm whitespace-nowrap flex items-center gap-3">
                  <span>
                    <Money value={b.total} />
                    {target ? <span className="text-[var(--muted)]"> / <Money value={target} /></span> : null}
                  </span>
                  {/* The name was already a link, but a name doesn't look like
                      one — so editing a bucket was effectively hidden. */}
                  <Link
                    href={`/buckets/${b.id}`}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Edit
                  </Link>
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
              {/* Share of everything you have in buckets. Describes where the
                  money is; it makes no claim about where it should be. */}
              {share > 0 && (
                <div className="text-xs text-[var(--muted)] mb-3">
                  {share}% of all bucketed money
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
          <button type="submit" className="btn w-full">
            Create
          </button>
          <p className="text-xs text-[var(--muted)]">
            No percentage to set here. How much each goal gets comes from its rank above, and you can
            override the split when you distribute.
          </p>
        </form>
      </div>
    </div>
  );
}
