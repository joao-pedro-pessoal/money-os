import { textForRequest } from "@/actions/pageLanguage";
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
import FilterLink from "@/components/FilterLink";
import { localDay } from "@/lib/calendar/localDay";

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
  const uiText = await textForRequest();
  const sp = await searchParams;
  const offset = Number(sp.offset ?? 0) || 0;

  const [data, unbudgeted] = await Promise.all([listBudgets(offset), getUnbudgetedSpending()]);
  const today = localDay();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">{uiText("Budgets")}</h1>
          <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">{uiText("A limit you set on what you intend to spend. Budgets move no money and hold no money — going over costs you nothing except knowing that you did.")}{" "}
            <Link href="/buckets" className="text-[var(--accent)] hover:underline">{uiText("Buckets")}</Link>{" "}{uiText("are the opposite: real money set aside inside an account.")}</p>
        </div>
        {/* Each budget has its own cycle now, so stepping moves every one of
            them by one of its own periods rather than by a shared month. */}
        <div className="flex items-center gap-2 text-sm">
          <FilterLink href={`/budgets?offset=${offset - 1}`} className="btn" aria-label={uiText("Previous budget period")}>
            ←
          </FilterLink>
          <span className="text-xs text-[var(--muted)] min-w-[7rem] text-center">
            {offset === 0 ? uiText("Current period") : uiText("{0} period{1} {2}", { "0": Math.abs(offset), "1": Math.abs(offset) === 1 ? "" : "s", "2": offset < 0 ? "back" : "ahead" })}
          </span>
          <FilterLink href={`/budgets?offset=${offset + 1}`} className="btn" aria-label={uiText("Next budget period")}>
            →
          </FilterLink>
        </div>
      </div>

      {(data.items.some(b => b.unconverted > 0) || unbudgeted.unconverted.length > 0) && <p role="status" className="card p-3 text-xs text-[var(--amber)]">{uiText("Spending totals are incomplete because an exchange rate is missing. Refresh rates in Settings.")}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">{uiText("Budgeted per month")}</div>
          <div className="text-xl font-semibold mt-1">
            <Money value={data.totalMonthly} currency={data.baseCurrency} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">{uiText("every period normalised to a month, so they can be compared")}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">{uiText("Budgets")}</div>
          <div className="text-xl font-semibold mt-1">{data.items.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-[var(--muted)]">{uiText("Over limit")}</div>
          <div
            className="text-xl font-semibold mt-1"
            style={{ color: data.overCount > 0 ? "var(--red)" : undefined }}
          >
            {data.overCount}
          </div>
        </div>
      </div>

      {data.items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-[var(--muted)]">{uiText("No budgets yet. Create one below — name it what you like, pick its period, and choose the categories it should watch.")}</div>
      ) : (
        <div className="space-y-4">
          {data.items.map((b) => (
            <div key={b.id} className="card p-4">
              {b.unconverted > 0 && <p className="text-xs text-[var(--amber)] mb-2">{uiText("Incomplete total — missing exchange rates.")}</p>}
              <div className="flex justify-between items-baseline gap-3 flex-wrap mb-2">
                <div>
                  <span className="text-sm font-medium"><span translate="no">{b.name}</span></span>
                  <span className="text-xs text-[var(--muted)] ml-2">
                    {PERIODS.find((p) => p.value === b.period)?.label.toLowerCase()} · {uiText(b.bounds.label ?? "")}
                  </span>
                </div>
                <div className="text-xs">
                  <Money value={b.spent} currency={data.baseCurrency} />{uiText(" of")}{" "}
                  <Money value={b.available} currency={data.baseCurrency} />
                  <span
                    className="ml-2"
                    style={{ color: b.remaining < 0 ? "var(--red)" : "var(--muted)" }}
                  >
                    {b.remaining < 0 ? uiText("over by ") : uiText("left ")}
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
                    title={uiText("{0}% through the period", { "0": Math.round(b.progress * 100) })}
                  />
                )}
              </div>

              <div className="flex justify-between items-center mt-2 gap-3 flex-wrap">
                <div className="text-[10px] text-[var(--muted)]">
                  {b.categories.join(", ") || uiText("no categories — watching nothing")}
                  {b.carried !== 0 && (
                    <>
                      {" · "}
                      <span style={{ color: b.carried < 0 ? "var(--red)" : "var(--green)" }}>
                        {b.carried > 0 ? "+" : "−"}
                        <Money value={Math.abs(b.carried)} currency={data.baseCurrency} />{uiText(" carried in")}</span>
                    </>
                  )}
                  {b.pacingOver && (
                    <span className="text-[var(--amber)]">{uiText(" · ahead of pace")}</span>
                  )}
                </div>

                <div className="budget-actions flex items-center gap-3 flex-wrap min-w-0">
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
                          ? uiText("Unspent budget carries forward — and so does overspend. Click to stop.")
                          : uiText("Each period starts fresh. Click to carry the balance forward.")
                      }
                    >
                      {b.rollover ? uiText("rolls over") : uiText("resets")}
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
                      className="input input-narrow budget-limit text-xs py-1"
                      aria-label={uiText("Limit for {0}", { "0": b.name })}
                    />
                    <button type="submit" className="text-xs text-[var(--accent)] hover:underline">{uiText("Save")}</button>
                  </form>

                  <form action={deleteBudget}>
                    <input type="hidden" name="id" value={b.id} />
                    <ConfirmSubmitButton
                      label={uiText("Delete")}
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
              <Money value={unbudgeted.uncategorised} currency={unbudgeted.baseCurrency} />{uiText(" spent this month with no category, so no budget can see it.")}{" "}
              <Link href="/transactions" className="text-[var(--accent)] hover:underline">{uiText("Categorise it")}</Link>
            </div>
          )}
          {unbudgeted.categories.length > 0 && (
            <div className="text-[var(--muted)]">{uiText("No budget watches:")}{" "}
              <span translate="no">{unbudgeted.categories.slice(0, 5).map((c) => `${c.name} (${c.amount.toFixed(0)})`).join(", ")}</span>
              {unbudgeted.categories.length > 5 && ` +${unbudgeted.categories.length - 5}`}
            </div>
          )}
        </div>
      )}

      <Section title="New budget" defaultOpen={data.items.length === 0} essential>
        <form action={createBudget} className="space-y-3 max-w-2xl">
          <input name="name" placeholder={uiText("Name (e.g. Going out, Insurance)")} className="input" required />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              name="limitAmount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder={uiText("Limit")}
              className="input"
              required
            />
            <select name="period" className="input" defaultValue="monthly">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {uiText(p.label ?? "")}
                </option>
              ))}
            </select>
            <input name="anchorDate" type="date" defaultValue={today} className="input" />
          </div>

          <div>
            <div className="text-xs text-[var(--muted)] mb-2">{uiText("Categories this budget watches — pick as many as you like")}</div>
            {data.availableCategories.length === 0 ? (
              <div className="text-xs text-[var(--amber)]">{uiText("No expense categories yet.")}{" "}
                <Link href="/settings/categories" className="text-[var(--accent)]">{uiText("Create some first")}</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                {data.availableCategories.map((c) => (
                  <label key={c.id} className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" name="categoryIds" value={c.id} />
                    <span className="truncate"><span translate="no">{c.name}</span></span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" name="rollover" className="mt-0.5" />
            <span className="text-[var(--muted)]">{uiText("Carry the balance between periods. Unspent budget adds to the next one —")}{" "}
              <span className="text-[var(--foreground)]">{uiText("and so does overspend")}</span>{uiText(", because starting fresh after blowing through it is what makes this kind of budget pointless.")}</span>
          </label>

          <button type="submit" className="btn w-full">{uiText("Create budget")}</button>
          <p className="text-xs text-[var(--muted)]">{uiText("The period runs from the date you pick, not from the 1st. A weekly budget started on a Wednesday runs Wednesday to Wednesday.")}</p>
        </form>
      </Section>
    </div>
  );
}
