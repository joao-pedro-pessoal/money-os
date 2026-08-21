import {
  listBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  setBudgetRollover,
  getUnbudgetedSpending,
} from "@/actions/budgets";
import { PERIODS } from "@/lib/accounting/envelopes";
import { Money } from "@/components/PrivacyContext";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Section from "@/components/Section";
import Link from "next/link";

const STATUS_COLOR: Record<string, string> = {
  under: "var(--green)",
  close: "var(--amber)",
  over: "var(--red)",
  none: "var(--muted)",
};

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>;
}) {
  const sp = await searchParams;
  const offset = Number(sp.offset ?? 0) || 0;

  const [data, unbudgeted] = await Promise.all([listBudgets(offset), getUnbudgetedSpending()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Budgets</h1>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
            A limit you set on what you intend to spend. Budgets move no money and hold no money —
            going over costs you nothing except knowing that you did.{" "}
            <Link href="/buckets" className="text-[var(--accent)] hover:underline">
              Buckets
            </Link>{" "}
            are the opposite: real money set aside inside an account.
          </p>
        </div>
        {/* Each budget has its own cycle now, so stepping moves every one of
            them by one of its own periods rather than by a shared month. */}
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/budgets?offset=${offset - 1}`} className="btn">
            ←
          </Link>
          <span className="text-xs text-[var(--muted)] min-w-[7rem] text-center">
            {offset === 0 ? "Current period" : `${Math.abs(offset)} period${Math.abs(offset) === 1 ? "" : "s"} ${offset < 0 ? "back" : "ahead"}`}
          </span>
          <Link href={`/budgets?offset=${offset + 1}`} className="btn">
            →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">Budgeted per month</div>
          <div className="text-xl font-semibold mt-1">
            <Money value={data.totalMonthly} currency={data.baseCurrency} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">
            every period normalised to a month, so they can be compared
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">Budgets</div>
          <div className="text-xl font-semibold mt-1">{data.items.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">Over limit</div>
          <div
            className="text-xl font-semibold mt-1"
            style={{ color: data.overCount > 0 ? "var(--red)" : undefined }}
          >
            {data.overCount}
          </div>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">
          No budgets yet. Create one below — name it what you like, pick its period, and choose the
          categories it should watch.
        </div>
      ) : (
        <div className="space-y-4">
          {data.items.map((b) => (
            <div key={b.id} className="card p-4">
              <div className="flex justify-between items-baseline gap-3 flex-wrap mb-2">
                <div>
                  <span className="text-sm font-medium">{b.name}</span>
                  <span className="text-xs text-[var(--muted)] ml-2">
                    {PERIODS.find((p) => p.value === b.period)?.label.toLowerCase()} · {b.bounds.label}
                  </span>
                </div>
                <div className="text-xs">
                  <Money value={b.spent} currency={data.baseCurrency} /> of{" "}
                  <Money value={b.available} currency={data.baseCurrency} />
                  <span
                    className="ml-2"
                    style={{ color: b.remaining < 0 ? "var(--red)" : "var(--muted)" }}
                  >
                    {b.remaining < 0 ? "over by " : "left "}
                    <Money value={Math.abs(b.remaining)} currency={data.baseCurrency} />
                  </span>
                </div>
              </div>

              <div className="h-2 rounded-full overflow-hidden bg-[var(--surface-2)] relative">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(b.percent, 100)}%`,
                    background: STATUS_COLOR[b.status],
                  }}
                />
                {/* Where the period is, so "80% spent" reads against "40% gone". */}
                {offset === 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-[var(--foreground)] opacity-40"
                    style={{ left: `${Math.round(b.progress * 100)}%` }}
                    title={`${Math.round(b.progress * 100)}% through the period`}
                  />
                )}
              </div>

              <div className="flex justify-between items-center mt-2 gap-3 flex-wrap">
                <div className="text-[10px] text-[var(--muted)]">
                  {b.categories.join(", ") || "no categories — watching nothing"}
                  {b.carried !== 0 && (
                    <>
                      {" · "}
                      <span style={{ color: b.carried < 0 ? "var(--red)" : "var(--green)" }}>
                        {b.carried > 0 ? "+" : "−"}
                        <Money value={Math.abs(b.carried)} currency={data.baseCurrency} /> carried in
                      </span>
                    </>
                  )}
                  {b.pacingOver && (
                    <span className="text-[var(--amber)]"> · ahead of pace</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <form action={setBudgetRollover}>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="rollover" value={String(!b.rollover)} />
                    <button
                      type="submit"
                      className="badge border text-[10px]"
                      style={{
                        borderColor: b.rollover ? "var(--accent)" : "var(--border)",
                        color: b.rollover ? "var(--accent)" : "var(--muted)",
                      }}
                      title={
                        b.rollover
                          ? "Unspent budget carries forward — and so does overspend. Click to stop."
                          : "Each period starts fresh. Click to carry the balance forward."
                      }
                    >
                      {b.rollover ? "rolls over" : "resets"}
                    </button>
                  </form>

                  <form action={updateBudget} className="flex gap-1 items-center">
                    <input type="hidden" name="id" value={b.id} />
                    <input
                      name="limitAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={b.limit}
                      className="input input-narrow text-xs py-1 w-24"
                    />
                    <button type="submit" className="text-xs text-[var(--accent)] hover:underline">
                      Save
                    </button>
                  </form>

                  <form action={deleteBudget}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmSubmitButton
                      label="Delete"
                      confirmMessage={`Delete the budget "${b.name}"? Your transactions are untouched.`}
                    />
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(unbudgeted.categories.length > 0 || unbudgeted.uncategorised > 0) && (
        <div className="card p-3 text-xs space-y-1" style={{ borderColor: "var(--amber)" }}>
          {unbudgeted.uncategorised > 0 && (
            <div>
              <Money value={unbudgeted.uncategorised} currency={unbudgeted.baseCurrency} /> spent this
              month with no category, so no budget can see it.{" "}
              <Link href="/transactions" className="text-[var(--accent)] hover:underline">
                Categorise it
              </Link>
            </div>
          )}
          {unbudgeted.categories.length > 0 && (
            <div className="text-[var(--muted)]">
              No budget watches:{" "}
              {unbudgeted.categories.slice(0, 5).map((c) => `${c.name} (${c.amount.toFixed(0)})`).join(", ")}
              {unbudgeted.categories.length > 5 && ` +${unbudgeted.categories.length - 5}`}
            </div>
          )}
        </div>
      )}

      <Section title="New budget" defaultOpen={data.items.length === 0}>
        <form action={createBudget} className="space-y-3 max-w-2xl">
          <input name="name" placeholder="Name (e.g. Going out, Insurance)" className="input" required />

          <div className="grid grid-cols-3 gap-2">
            <input
              name="limitAmount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Limit"
              className="input"
              required
            />
            <select name="period" className="input" defaultValue="monthly">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <input name="anchorDate" type="date" defaultValue={today} className="input" />
          </div>

          <div>
            <div className="text-xs text-[var(--muted)] mb-2">
              Categories this budget watches — pick as many as you like
            </div>
            {data.availableCategories.length === 0 ? (
              <div className="text-xs text-[var(--amber)]">
                No expense categories yet.{" "}
                <Link href="/settings/categories" className="text-[var(--accent)]">
                  Create some first
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {data.availableCategories.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" name="categoryIds" value={c.id} />
                    <span className="truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" name="rollover" className="mt-0.5" />
            <span className="text-[var(--muted)]">
              Carry the balance between periods. Unspent budget adds to the next one —{" "}
              <span className="text-[var(--foreground)]">and so does overspend</span>, because
              starting fresh after blowing through it is what makes this kind of budget pointless.
            </span>
          </label>

          <button type="submit" className="btn w-full">
            Create budget
          </button>
          <p className="text-xs text-[var(--muted)]">
            The period runs from the date you pick, not from the 1st. A weekly budget started on a
            Wednesday runs Wednesday to Wednesday.
          </p>
        </form>
      </Section>
    </div>
  );
}
