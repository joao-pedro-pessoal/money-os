import {
  listExpected,
  listExpectedOptions,
  createExpected,
  markExpectedReceived,
  stopExpected,
  deleteExpected,
} from "@/actions/expected";
import { Money } from "@/components/PrivacyContext";
import { ARRIVALS } from "@/lib/accounting/expected";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Link from "next/link";

/**
 * Money that is coming but has not arrived.
 *
 * The one thing this page must never do is add these figures to what you have.
 * They sit beside Net Worth, never inside it — a total that includes money you
 * cannot spend is worse than no total, because it gets acted on.
 */
export default async function ExpectedPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ from }, data, options] = await Promise.all([
    searchParams,
    listExpected(),
    listExpectedOptions(),
  ]);

  /**
   * The category the form is being filled in for, when one was picked.
   *
   * In the URL rather than in state so the page stays a server component and
   * the half-filled form survives a refresh.
   */
  const filling = from ? data.unscheduled.find((c) => c.id === from) ?? null : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Coming in</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-prose leading-relaxed">
          A salary due on the 25th, a refund, someone paying you back, a withdrawal still in
          flight. One-off or recurring — the difference is only how often.{" "}
          <span className="text-[var(--foreground)]">
            None of it counts toward Net Worth or any balance.
          </span>{" "}
          It has not arrived, so it is shown beside what you have rather than inside it.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-[10px] text-[var(--muted)]">Next 30 days</div>
          <div className="text-xl font-semibold">
            <Money value={data.within30} currency={data.baseCurrency} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">dated inside the window</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-[var(--muted)]">Still coming, in total</div>
          <div className="text-xl font-semibold">
            <Money value={data.total} currency={data.baseCurrency} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">
            including anything with no date
          </div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-[var(--muted)]">Already arrived</div>
          <div className="text-xl font-semibold">{data.settled}</div>
          <div className="text-[10px] text-[var(--muted)] mt-1">
            kept as evidence, counted nowhere
          </div>
        </div>
      </div>

      {data.unconverted.length > 0 && (
        <div className="text-[10px] text-[var(--amber)] max-w-prose leading-relaxed">
          {data.unconverted.length} amount
          {data.unconverted.length === 1 ? " is" : "s are"} missing from both totals above —{" "}
          {[...new Set(data.unconverted.map((u) => u.currency))].join(", ")} has no exchange rate,
          so it is left out and said rather than counted as nothing.
        </div>
      )}

      {/*
        A category marked "fixed" says this kind of money arrives whether you
        act or not — and says nothing about how much, or when. Those two facts
        are the only things missing, so the page asks for them rather than
        leaving a blank form and rather than inventing them.
      */}
      {data.unscheduled.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium">Fixed income you have not scheduled</div>
          <p className="text-xs text-[var(--muted)] mt-1 mb-3 max-w-prose leading-relaxed">
            {data.unscheduled.map((c) => c.name).join(", ")}{" "}
            {data.unscheduled.length === 1 ? "is marked" : "are marked"} fixed — money that
            arrives whether you act or not. A category says what kind of money it is, not how
            much or when, so those are the two things left to fill in.
          </p>
          <div className="flex gap-2 flex-wrap">
            {data.unscheduled.map((c) => (
              <Link
                key={c.id}
                href={`/expected?from=${c.id}`}
                className="badge border text-xs"
                style={{
                  borderColor: filling?.id === c.id ? "var(--accent)" : "var(--border)",
                  color: filling?.id === c.id ? "var(--accent)" : "var(--muted)",
                }}
              >
                Schedule {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.rows.length > 0 && (
        <div className="card p-4">
          <div className="text-sm font-medium mb-3">Still coming</div>
          <div className="overflow-x-auto">
            <table className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>What</th>
                  <th>How often</th>
                  <th>When</th>
                  <th>Landing in</th>
                  <th className="text-right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      {r.name}
                      {r.categoryName && (
                        <div className="text-[10px] text-[var(--muted)]">{r.categoryName}</div>
                      )}
                    </td>
                    <td className="text-[var(--muted)]">
                      {ARRIVALS.find((a) => a.value === r.arrival)?.label ?? r.arrival}
                    </td>
                    <td className={r.overdue ? "text-[var(--red)]" : undefined}>
                      {/* No date is a real answer for a debt with no agreed
                          day, and reads better than an invented one. */}
                      {r.next === null ? (
                        <span className="text-[var(--muted)]">no date</span>
                      ) : (
                        <>
                          {r.next.toLocaleDateString("pt-PT")}
                          {r.inDays !== null && (
                            <div className="text-[10px]">
                              {r.overdue
                                ? `${Math.abs(r.inDays)} days late`
                                : r.inDays === 0
                                  ? "today"
                                  : `in ${r.inDays} days`}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="text-[var(--muted)]">{r.accountName ?? "—"}</td>
                    <td className="text-right font-medium">
                      <Money value={r.amount} currency={r.currency} />
                    </td>
                    <td className="text-right">
                      <div className="flex gap-3 justify-end">
                        <form action={markExpectedReceived}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="text-xs text-[var(--accent)]">
                            Arrived
                          </button>
                        </form>
                        {r.arrival !== "once" && (
                          <form action={stopExpected}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="text-xs text-[var(--muted)]">
                              Stop
                            </button>
                          </form>
                        )}
                        <form action={deleteExpected}>
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmSubmitButton
                            label="Delete"
                            confirmMessage={`Remove "${r.name}" entirely? Marking it arrived keeps the record instead.`}
                          />
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-4 max-w-md">
        <div className="text-sm font-medium mb-3">
          {filling ? `Schedule ${filling.name}` : "Add something coming in"}
        </div>
        <form action={createExpected} className="space-y-3" key={filling?.id ?? "blank"}>
          <input
            name="name"
            placeholder="What is it? (e.g. Salary, refund)"
            className="input"
            defaultValue={filling?.name ?? ""}
            required
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              className="input"
              required
            />
            <input name="currency" defaultValue="EUR" className="input" maxLength={3} />
          </div>

          {/* Fixed income recurs by definition — that is what the label means
              — so a monthly default is a reading of what you already said
              rather than a guess. Changeable, like any default. */}
          <select name="arrival" className="input" defaultValue={filling ? "monthly" : "once"}>
            {ARRIVALS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>

          <label className="text-xs block">
            <span className="text-[var(--muted)]">
              When — leave empty if there is no agreed day
            </span>
            <input name="expectedAt" type="date" className="input mt-1" />
          </label>

          {options.accounts.length > 0 && (
            <select name="accountId" className="input" defaultValue="">
              <option value="">Landing account — not decided</option>
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}

          {options.categories.length > 0 && (
            <select name="categoryId" className="input" defaultValue={filling?.id ?? ""}>
              <option value="">Category — none</option>
              {options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <input name="notes" placeholder="Notes" className="input" />

          <button type="submit" className="btn">
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
