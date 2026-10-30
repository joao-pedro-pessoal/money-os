import RetryableForm from "@/components/RetryableForm";
import { getRates } from "@/actions/fx";
import { sumInBase } from "@/lib/fx";
import { textForRequest } from "@/actions/pageLanguage";
import ResponsiveTable from "@/components/ResponsiveTable";
import { listBucketsWithTotals, submitBucketCreation, submitAllocationAddition } from "@/actions/buckets";
import { listAccountsWithState } from "@/actions/accounts";
import { listPurposes } from "@/actions/purpose";
import {
  listGoalsByPriority,
  moveGoal,
  submitDistribution,
  getDefaultShares,
  setPriority,
} from "@/actions/distribute";
import { Money } from "@/components/PrivacyContext";
import Distributor from "@/components/Distributor";
import Link from "next/link";
import Section from "@/components/Section";
import DonutChart from "@/components/DonutChart";

export default async function BucketsPage() {
  const uiText = await textForRequest();
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
  const distributable = sumInBase(accounts.map(a => ({ amount: Math.max(0, a.free), currency: a.currency })), await getRates(), base);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-semibold">{uiText("Buckets")}</h1>

      {buckets.some((b) => b.total > 0) && (
        <div className="card p-4">
          <DonutChart compact currency={base} data={buckets.filter((b) => b.total > 0).map((b) => ({ name: b.name, value: b.total }))} />
        </div>
      )}

      {(distributable.unconverted.length > 0 || buckets.some(b => b.unconverted.length > 0)) && <p role="status" className="card p-3 text-xs text-[var(--amber)]">{uiText("Goal totals are incomplete because an exchange rate is missing. Refresh rates in Settings.")}</p>}
      {/* The hierarchy, and the thing that makes it worth having. */}
      <Section title="Distribute money" defaultOpen>
        <Distributor
          available={distributable.total}
          currency={base}
          defaultShares={defaultShares}
          applyAction={submitDistribution}
        />
      </Section>

      {ranked.length > 1 && (
        <Section title="Priority" defaultOpen essential summary={uiText("{0} buckets", { "0": ranked.length })}>
          <p className="text-xs text-[var(--muted)] mb-3">{uiText("Money is shared out in this order, with the higher ranks getting more. Two goals on the same rank get the same share — set them to the same number to say \"these matter equally\".")}</p>
          <ul className="space-y-1">
            {ranked.map((g) => {
              const short = g.target === null ? null : Math.max(0, g.target - g.current);
              // Ties are a feature, so they have to be visible: the rank number
              // repeats rather than counting 1,2,3 down the list.
              const tied = ranked.filter((x) => x.priority === g.priority).length > 1;
              const rank = ranked.filter((x) => x.priority < g.priority).length + 1;
              return (
                <li key={g.id} className="bucket-priority-row flex items-center gap-2 text-sm py-1">
                  <span
                    className="bucket-priority-rank text-xs w-5"
                    style={{ color: tied ? "var(--accent)" : "var(--muted)" }}
                    title={tied ? uiText("Shares this rank with another goal") : undefined}
                  >
                    {rank}
                  </span>
                  <Link href={`/buckets/${g.id}`} className="bucket-priority-name flex-1 truncate hover:underline">
                    <span translate="no">{g.name}</span>
                  </Link>
                  <span className="bucket-priority-share text-[10px] text-[var(--accent)] whitespace-nowrap w-12 text-right">
                    {shareOf.get(g.id)?.toFixed(1) ?? "0"}%
                  </span>
                  <span className="bucket-priority-remaining text-xs text-[var(--muted)] whitespace-nowrap">
                    {short === null ? (
                      uiText("no target")
                    ) : short === 0 ? (
                      <span className="text-[var(--green)]">{uiText("full")}</span>
                    ) : (
                      <>
                        <Money value={short} currency={base} />{uiText(" to go")}</>
                    )}
                  </span>
                  {/* Direct entry as well as arrows: setting two goals to the
                      same number is how you create a tie, and nudging can only
                      ever pass through one. */}
                  <form action={setPriority} className="bucket-priority-form flex items-center gap-1">
                    <input type="hidden" name="id" value={g.id} />
                    <input
                      name="priority"
                      type="number"
                      min="0"
                      defaultValue={g.priority}
                      className="bucket-priority-input input input-narrow text-xs py-0.5"
                      title={uiText("Rank — lower is more important. Equal numbers share equally.")}
                    />
                    <button type="submit" className="text-[10px] text-[var(--accent)] hover:underline">{uiText("Set")}</button>
                  </form>
                  <div className="bucket-priority-moves flex gap-1">
                    <form action={moveGoal}>
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="direction" value="up" />
                      <button
                        type="submit"
                        disabled={g.priority === 0}
                        className="text-xs px-1 text-[var(--muted)] hover:text-[var(--foreground)]"
                        style={g.priority === 0 ? { opacity: 0.3 } : undefined}
                        aria-label={uiText("Move {0} up", { "0": g.name })}
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
                        aria-label={uiText("Move {0} down", { "0": g.name })}
                      >
                        ↓
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* A goal made of cash AND investments. The two progress figures exist
          because "100% funded" by an ETF and by cash are not the same claim. */}
      {withInvestments.purposes.some((p) => p.totals.invested > 0) && (
        <Section title="Including investments" defaultOpen>
          <p className="text-xs text-[var(--muted)] mb-3 max-w-2xl">{uiText("Positions you've assigned to a goal, counted at their current market value. The conservative figure ignores everything exposed to the market, so you can see how much of each goal survives a bad month.")}</p>
          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>{uiText("Goal")}</th>
                  <th className="text-right">{uiText("Cash")}</th>
                  <th className="text-right">{uiText("Invested")}</th>
                  {/* `investedPnl` is the unrealised gain on the invested
                      share — profit a price move can take back, not money
                      banked towards the goal. */}
                  <th className="text-right">{uiText("Unrealized P&L")}</th>
                  <th className="text-right">{uiText("Total")}</th>
                  <th className="text-right">{uiText("Progress")}</th>
                </tr>
              </thead>
              <tbody>
                {withInvestments.purposes
                  .filter((p) => p.totals.invested > 0)
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium"><span translate="no">{p.name}</span></td>
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
                          <span className="text-[var(--muted)]">{uiText("no target")}</span>
                        ) : (
                          <>
                            {p.progress.percent.toFixed(0)}%
                            <div className="text-[10px] text-[var(--muted)]">
                              {p.progress.conservativePercent?.toFixed(0)}{uiText("% guaranteed")}</div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </ResponsiveTable></div>
          </div>
        </Section>
      )}

      <Section title="Add money to a bucket" defaultOpen className="max-w-lg">
        <p className="text-xs text-[var(--muted)] mb-3">{uiText("Move some of an account's free cash into a bucket. This doesn't move real money — it just marks it as reserved for that purpose.")}</p>
        {buckets.length === 0 || accounts.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            {accounts.length === 0 ? uiText("Create an account first.") : uiText("Create a bucket below first.")}
          </p>
        ) : (
          <RetryableForm action={submitAllocationAddition} fieldsClassName="space-y-3">
            <select name="accountId" className="input" required>
              {accounts.map((a) => (
                <option translate="no" key={a.id} value={a.id}>
                  {a.name}{uiText(" — free: ")}{a.free.toFixed(2)} {a.currency}
                </option>
              ))}
            </select>
            <select name="bucketId" className="input" required>
              {buckets.map((b) => (
                <option translate="no" key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input name="amount" type="number" step="0.01" placeholder={uiText("Amount")} className="input" required />
            <button type="submit" className="btn w-full">{uiText("Add to bucket")}</button>

          </RetryableForm>
        )}
      </Section>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {buckets.map((b) => {
          const target = b.targetAmount ? Number(b.targetAmount) : null;
          const pct = target ? Math.min(100, Math.round((b.total / target) * 100)) : null;
          const goalReached = target !== null && b.total >= target;
          const share = shareOfTotal.get(b.id) ?? 0;
          return (
            <div key={b.id} className="card p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Link href={`/buckets/${b.id}`} className="text-sm font-medium hover:underline truncate">
                    <span translate="no">{b.name}</span>
                  </Link>
                  {goalReached && (
                    <span className="badge border border-[var(--green)] text-[var(--green)] shrink-0">{uiText("✓ Goal reached")}</span>
                  )}
                </div>
                <div className="text-sm whitespace-nowrap flex items-center gap-3">
                  <span>
                    <Money value={b.total} currency={b.baseCurrency} />
                    {target ? <span className="text-[var(--muted)]"> / <Money value={target} currency={b.baseCurrency} /></span> : null}
                  </span>
                  {/* The name was already a link, but a name doesn't look like
                      one — so editing a bucket was effectively hidden. */}
                  <Link
                    href={`/buckets/${b.id}`}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >{uiText("Edit")}</Link>
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
                  {share}{uiText("% of all bucketed money")}</div>
              )}
              {b.unconverted.length > 0 && <p className="text-xs text-[var(--amber)]">{uiText("Incomplete total — missing exchange rates.")}</p>}
              <div className="space-y-1">
                {b.allocations.map((a) => (
                  <div key={a.id} className="flex justify-between text-xs text-[var(--muted)]">
                    <span><span translate="no">{a.accountName}</span></span>
                    <Money value={a.amount} currency={a.currency} />
                  </div>
                ))}
                {b.allocations.length === 0 && (
                  <div className="text-xs text-[var(--muted)]">{uiText("No money allocated yet.")}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Section title="Create bucket" defaultOpen className="max-w-md">
        <RetryableForm action={submitBucketCreation} fieldsClassName="space-y-3">
          <input name="name" placeholder={uiText("Name (e.g. Emergency Fund)")} className="input" required />
          <input name="description" placeholder={uiText("Description")} className="input" />
          <input name="targetAmount" type="number" step="0.01" placeholder={uiText("Target amount (optional)")} className="input" />
          <button type="submit" className="btn w-full">{uiText("Create")}</button>
          <p className="text-xs text-[var(--muted)]">{uiText("No percentage to set here. How much each goal gets comes from its rank above, and you can override the split when you distribute.")}</p>
        </RetryableForm>
      </Section>
    </div>
  );
}
