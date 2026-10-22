import { textForRequest } from "@/actions/pageLanguage";
import ResponsiveTable from "@/components/ResponsiveTable";
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
import ArrivalFields from "@/components/ArrivalFields";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Link from "next/link";
import Section from "@/components/Section";

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
  const uiText = await textForRequest();
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
        <h1 className="text-lg font-semibold">{uiText("Coming in")}</h1>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-prose leading-relaxed">{uiText("A salary due on the 25th, a refund, someone paying you back, a withdrawal still in flight. One-off or recurring — the difference is only how often.")}{" "}
          <span className="text-[var(--foreground)]">{uiText("None of it counts toward Net Worth or any balance.")}</span>{" "}{uiText("It has not arrived, so it is shown beside what you have rather than inside it.")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-[10px] text-[var(--muted)]">{uiText("Next 30 days")}</div>
          <div className="text-xl font-semibold">
            <Money value={data.within30} currency={data.baseCurrency} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">{uiText("dated inside the window")}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-[var(--muted)]">{uiText("Still coming, in total")}</div>
          <div className="text-xl font-semibold">
            <Money value={data.total} currency={data.baseCurrency} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">{uiText("including anything with no date")}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] text-[var(--muted)]">{uiText("Already arrived")}</div>
          <div className="text-xl font-semibold">{data.settled}</div>
          <div className="text-[10px] text-[var(--muted)] mt-1">{uiText("kept as evidence, counted nowhere")}</div>
        </div>
      </div>

      {data.unconverted.length > 0 && (
        <div className="text-[10px] text-[var(--amber)] max-w-prose leading-relaxed">
          {data.unconverted.length}{uiText(" amount")}{data.unconverted.length === 1 ? uiText(" is") : uiText("s are")}{uiText(" missing from both totals above —")}{" "}
          {[...new Set(data.unconverted.map((u) => u.currency))].join(", ")}{uiText(" has no exchange rate, so it is left out and said rather than counted as nothing.")}</div>
      )}

      {/*
        A category marked "fixed" says this kind of money arrives whether you
        act or not — and says nothing about how much, or when. Those two facts
        are the only things missing, so the page asks for them rather than
        leaving a blank form and rather than inventing them.
      */}
      {data.unscheduled.length > 0 && (
        <Section
          title="Fixed income you have not scheduled"
          defaultOpen
          summary={uiText("{0} missing", { "0": data.unscheduled.length })}
        >
          <p className="text-xs text-[var(--muted)] mt-1 mb-3 max-w-prose leading-relaxed">
            <span translate="no">{data.unscheduled.map((c) => c.name).join(", ")}</span>{" "}
            {data.unscheduled.length === 1 ? uiText("is marked") : uiText("are marked")}{uiText(" fixed — money that arrives whether you act or not. A category says what kind of money it is, not how much or when, so those are the two things left to fill in.")}</p>
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
              >{uiText("Schedule ")}<span translate="no">{c.name}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {data.rows.length > 0 && (
        <Section
          title="Still coming"
          defaultOpen
          essential
          summary={`${data.rows.length} ${data.rows.length === 1 ? "entry" : "entries"}`}
        >
          <div className="overflow-x-auto">
            <div className="table-scroll" role="region" aria-label={uiText("Scrollable data table")} tabIndex={0}><ResponsiveTable className="data-table whitespace-nowrap">
              <thead>
                <tr>
                  <th>{uiText("What")}</th>
                  <th>{uiText("How often")}</th>
                  <th>{uiText("When")}</th>
                  <th>{uiText("Landing in")}</th>
                  <th className="text-right">{uiText("Amount")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      <span translate="no">{r.name}</span>
                      {r.categoryName && (
                        <div className="text-[10px] text-[var(--muted)]"><span translate="no">{r.categoryName}</span></div>
                      )}
                    </td>
                    <td className="text-[var(--muted)]">
                      {uiText(ARRIVALS.find((a) => a.value === r.arrival)?.label ?? r.arrival)}
                    </td>
                    <td className={r.overdue ? "text-[var(--red)]" : undefined}>
                      {/* No date is a real answer for a debt with no agreed
                          day, and reads better than an invented one. */}
                      {r.next === null ? (
                        <span className="text-[var(--muted)]">{uiText("no date")}</span>
                      ) : (
                        <>
                          {r.next.toLocaleDateString("pt-PT")}
                          {r.inDays !== null && (
                            <div className="text-[10px]">
                              {r.overdue
                                ? uiText("{0} days late", { "0": Math.abs(r.inDays) })
                                : r.inDays === 0
                                  ? uiText("today")
                                  : uiText("in {0} days", { "0": r.inDays })}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="text-[var(--muted)]"><span translate="no">{r.accountName ?? "—"}</span></td>
                    <td className="text-right font-medium">
                      <Money value={r.amount} currency={r.currency} />
                    </td>
                    <td className="text-right">
                      <div className="flex gap-3 justify-end">
                        <form action={markExpectedReceived}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="text-xs text-[var(--accent)]">{uiText("Arrived")}</button>
                        </form>
                        {r.arrival !== "once" && (
                          <form action={stopExpected}>
                            <input type="hidden" name="id" value={r.id} />
                            <button type="submit" className="text-xs text-[var(--muted)]">{uiText("Stop")}</button>
                          </form>
                        )}
                        <form action={deleteExpected}>
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmSubmitButton
                            label={uiText("Delete")}
                            confirmMessage={`Remove "${r.name}" entirely? Marking it arrived keeps the record instead.`}
                          />
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable></div>
          </div>
        </Section>
      )}

      <Section
        title={filling ? `Schedule ${filling.name}` : "Add something coming in"}
        defaultOpen
        persistKey="expected:add"
        essential={Boolean(filling)}
        className="max-w-md"
      >
        <form action={createExpected} className="space-y-3" key={filling?.id ?? "blank"}>
          <input
            name="name"
            placeholder={uiText("What is it? (e.g. Salary, refund)")}
            className="input"
            defaultValue={filling?.name ?? ""}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder={uiText("Amount")}
              className="input"
              required
            />
            <input name="currency" defaultValue="EUR" className="input" maxLength={3} />
          </div>

          {/* Fixed income recurs by definition — that is what the label means
              — so a monthly default is a reading of what you already said
              rather than a guess. Changeable, like any default.

              The field under it follows the cadence: a day of the month for
              monthly, a weekday for weekly, a full date otherwise. */}
          <ArrivalFields defaultArrival={filling ? "monthly" : "once"} />

          {options.accounts.length > 0 && (
            <select name="accountId" className="input" defaultValue="">
              <option value="">{uiText("Landing account — not decided")}</option>
              {options.accounts.map((a) => (
                <option translate="no" key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}

          {options.categories.length > 0 && (
            <select name="categoryId" className="input" defaultValue={filling?.id ?? ""}>
              <option value="">{uiText("Category — none")}</option>
              {options.categories.map((c) => (
                <option translate="no" key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <input name="notes" placeholder={uiText("Notes")} className="input" />

          <button type="submit" className="btn">{uiText("Add")}</button>
        </form>
      </Section>
    </div>
  );
}
