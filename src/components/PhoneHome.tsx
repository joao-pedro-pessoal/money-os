import Link from "next/link";
import { Money } from "./PrivacyContext";
import PhoneIcon from "./PhoneIcon";
import TryQuickEntry from "./TryQuickEntry";
import DueSubscriptionCharges from "./DueSubscriptionCharges";
import { dayKey, monthBudgetLine, type BudgetLike } from "@/lib/ui/phoneSummary";
import type { TextTranslator } from "@/lib/i18n/text";
import type { ComponentProps } from "react";
import PhoneTransactionRow, { type PhoneTransaction } from "./PhoneTransactionRow";

type Row = PhoneTransaction;

/**
 * The home screen on a phone (F30), from the approved mockup: one main figure,
 * the four things done most, the latest entries, the month in one card, then
 * what is coming in, budgets, goals and subscriptions. Every figure is one the
 * dashboard already computed and passes in; nothing here adds money up anew
 * except the month's budget line, from `monthBudgetLine`.
 */
export default function PhoneHome({
  uiText, locale, currency, worth, month, series, recent, budgets, goals, coming, subscriptions, due, canSend, hasAccounts, getStarted,
}: {
  uiText: TextTranslator;
  locale: string;
  currency: string;
  worth: { total: number; cash: number; liabilities: number };
  month: { income: number; expenses: number };
  series: { netWorth: number }[];
  recent: Row[];
  budgets: (BudgetLike & { id: string; name: string })[];
  goals: { id: string; name: string; total: number; targetAmount: string | null }[];
  coming: { total: number; rows: { id: string; name: string; remaining: number; currency: string; next: Date | null; overdue: boolean }[] };
  subscriptions: { monthly: number; next: { name: string; on: Date; amount: number | null } | null; count: number };
  due: ComponentProps<typeof DueSubscriptionCharges>;
  canSend: boolean;
  hasAccounts: boolean;
  getStarted: React.ReactNode;
}) {
  const today = new Date();
  const net = Math.round((month.income - month.expenses) * 100) / 100;
  const line = monthBudgetLine(budgets, today);
  const day = (date: Date) => date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  /** For what already happened: today, yesterday, else the date. */
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const when = (date: Date) => dayKey(date) === dayKey(today) ? uiText("Today") : dayKey(date) === dayKey(yesterday) ? uiText("Yesterday") : date.toLocaleDateString(locale, { day: "numeric", month: "short" });

  // A line through the recorded values, only when there are enough to be a line.
  const points = series.slice(-12).map(point => point.netWorth);
  const spark = points.length >= 3 ? (() => {
    const low = Math.min(...points), high = Math.max(...points), span = high - low || 1;
    return points.map((value, i) => `${i === 0 ? "M" : "L"}${(2 + (i / (points.length - 1)) * 116).toFixed(1)} ${(38 - ((value - low) / span) * 32).toFixed(1)}`).join(" ");
  })() : null;

  return (
    <div className="ph-home">
      <h1 className="sr-only">{uiText("Dashboard")}</h1>
      <Link href="/accounts" className="ph-hero">
        <span className="ph-hero-top">
          <span>{uiText("Net worth")}</span>
          <span className="ph-hero-more">{uiText("See accounts")}<PhoneIcon name="chevron" size={14} strokeWidth={2.2} /></span>
        </span>
        <span className="ph-hero-main">
          <span className="ph-hero-figures">
            <span className="ph-hero-total"><Money value={worth.total} currency={currency} /></span>
            {(month.income > 0 || month.expenses > 0) && (
              <span className="ph-hero-chip">{net >= 0 ? "+" : "−"}<Money value={Math.abs(net)} currency={currency} />{uiText(" this month")}</span>
            )}
          </span>
          {spark && <svg aria-hidden="true" className="ph-hero-spark" viewBox="0 0 120 44" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={spark} /></svg>}
        </span>
        <span className="ph-hero-split">
          <span><small>{uiText("In accounts")}</small><strong><Money value={worth.cash} currency={currency} /></strong></span>
          <span><small>{uiText("What you owe")}</small><strong><Money value={worth.liabilities} currency={currency} /></strong></span>
        </span>
      </Link>

      <nav aria-label={uiText("Everyday tasks")} className="ph-actions">
        <TryQuickEntry kind="expense" label="Expense" className="ph-action" icon="out" />
        <TryQuickEntry kind="income" label="Income" className="ph-action" icon="in" />
        {canSend
          ? <TryQuickEntry kind="transfer" label="Send" className="ph-action" icon="transfer" />
          : <Link href="/accounts" className="ph-action"><span className="ph-action-icon"><PhoneIcon name="wallet" size={22} strokeWidth={2} /></span>{uiText("Accounts")}</Link>}
        <Link href="/import" className="ph-action"><span className="ph-action-icon"><PhoneIcon name="import" size={22} strokeWidth={2} /></span>{uiText("Import")}</Link>
      </nav>

      {getStarted}
      <DueSubscriptionCharges {...due} compact titleId="ph-due-charges" />

      <section className="ph-section" aria-labelledby="ph-recent">
        <div className="ph-section-head">
          <h2 id="ph-recent" className="ph-h2">{uiText("Latest entries")}</h2>
          <Link href="/transactions" className="ph-link">{uiText("See all")}</Link>
        </div>
        {recent.length === 0 ? (
          <p className="ph-empty">{hasAccounts ? uiText("Nothing recorded yet. The + button records your first one.") : uiText("Add an account first, then record what comes in and goes out.")}</p>
        ) : (
          <ul className="ph-rows">
            {recent.map(row => <PhoneTransactionRow key={row.id} row={row} uiText={uiText} currency={currency} when={when(new Date(row.date))} />)}
          </ul>
        )}
      </section>

      <Link href="/transactions" className="ph-card ph-month">
        <span className="ph-section-head">
          <span className="ph-h2">{uiText("This month")}</span>
          <span className="ph-link">{uiText("See entries")}</span>
        </span>
        <span className="ph-month-split">
          <span className="ph-month-figure"><span className="ph-dot ph-dot-in"><PhoneIcon name="in" size={16} strokeWidth={2.2} /></span><span><small>{uiText("Came in")}</small><strong><Money value={month.income} currency={currency} /></strong></span></span>
          <span className="ph-month-figure"><span className="ph-dot ph-dot-out"><PhoneIcon name="out" size={16} strokeWidth={2.2} /></span><span><small>{uiText("Went out")}</small><strong><Money value={month.expenses} currency={currency} /></strong></span></span>
        </span>
        {line ? (
          <span className="ph-budget-line">
            <span className="ph-bar-label"><span>{uiText("Monthly budget")}</span><span><Money value={line.spent} currency={currency} />{uiText(" of ")}<Money value={line.available} currency={currency} /></span></span>
            <span className="ph-bar" aria-hidden="true"><span style={{ width: `${line.percent}%` }} data-over={line.over || undefined} /></span>
            <span className="ph-month-note">
              {line.left > 0
                ? <>{uiText("You can still spend ")}<strong><Money value={line.left} currency={currency} /></strong>{uiText(line.daysLeft === 1 ? " today." : " in the next {0} days.", { "0": line.daysLeft })}</>
                : uiText("This month's budgets are used up.")}
            </span>
          </span>
        ) : (
          <span className="ph-month-note">{uiText("Set a monthly budget to see how much you can still spend.")}</span>
        )}
      </Link>

      {coming.rows.length > 0 && (
        <section className="ph-card" aria-labelledby="ph-coming">
          <div className="ph-section-head">
            <h2 id="ph-coming" className="ph-h2">{uiText("Coming in")}</h2>
            <Link href="/expected" className="ph-link">{uiText("See all")}</Link>
          </div>
          <p className="ph-sub">{uiText("Still coming, in total")}: <strong><Money value={coming.total} currency={currency} /></strong></p>
          <ul className="ph-rows ph-rows-divided">
            {coming.rows.slice(0, 3).map(row => (
              <li key={row.id}>
                <Link href="/expected" className="ph-row">
                  <span className={`ph-icon-box${row.overdue ? " ph-warn" : ""}`}><PhoneIcon name={row.overdue ? "clock" : "calendar"} size={18} /></span>
                  <span className="ph-row-text">
                    <span translate="no" className="ph-row-title">{row.name}</span>
                    <span className={`ph-row-sub${row.overdue ? " ph-warn-text" : ""}`}>{row.next ? (row.overdue ? uiText("Late since {0}", { "0": day(row.next) }) : day(row.next)) : uiText("No date")}</span>
                  </span>
                  {row.overdue ? <span className="ph-pill">{uiText("Arrived?")}</span> : <span className="ph-amount ph-in"><Money value={row.remaining} currency={row.currency} /></span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {budgets.length > 0 && (
        <section className="ph-card" aria-labelledby="ph-budgets">
          <div className="ph-section-head">
            <h2 id="ph-budgets" className="ph-h2">{uiText("Budgets")}</h2>
            <Link href="/budgets" className="ph-link">{uiText("See all")}</Link>
          </div>
          <ul className="ph-budgets">
            {budgets.slice(0, 4).map(budget => {
              const percent = budget.available > 0 ? Math.min(100, Math.round((budget.spent / budget.available) * 100)) : 100;
              const tone = budget.spent > budget.available ? "over" : percent >= 85 ? "near" : "ok";
              return (
                <li key={budget.id}>
                  <Link href="/budgets" className="ph-budget">
                    <span className="ph-bar-label"><span translate="no" className="ph-row-title">{budget.name}</span><span><strong><Money value={budget.spent} currency={currency} /></strong><span className="ph-muted">{uiText(" of ")}<Money value={budget.available} currency={currency} /></span></span></span>
                    <span className="ph-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} data-tone={tone} /></span>
                    <span className={`ph-row-sub${tone === "over" ? " ph-over-text" : ""}`}>
                      {tone === "over"
                        ? <>{uiText("Over by ")}<Money value={Math.round((budget.spent - budget.available) * 100) / 100} currency={currency} /></>
                        : <><Money value={Math.max(0, budget.remaining)} currency={currency} />{uiText(" left")}</>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {goals.length > 0 && (
        <section className="ph-section" aria-labelledby="ph-goals">
          <div className="ph-section-head">
            <h2 id="ph-goals" className="ph-h2">{uiText("Buckets")}</h2>
            <Link href="/buckets" className="ph-link">{uiText("See all")}</Link>
          </div>
          <div className="ph-goal-strip">
            {goals.map(goal => {
              const target = goal.targetAmount === null ? null : Number(goal.targetAmount);
              const percent = target && target > 0 ? Math.min(100, Math.round((goal.total / target) * 100)) : null;
              return (
                <Link key={goal.id} href={`/buckets/${goal.id}`} className="ph-goal-card">
                  <span className="ph-tile-title"><span className="ph-icon-box"><PhoneIcon name="target" size={18} /></span><span translate="no" className="ph-row-title">{goal.name}</span></span>
                  <span className="ph-goal-figure"><Money value={goal.total} currency={currency} />{target !== null && <span className="ph-muted"> / <Money value={target} currency={currency} /></span>}</span>
                  {percent !== null && <span className="ph-bar ph-bar-thin" aria-hidden="true"><span style={{ width: `${percent}%` }} data-tone={percent >= 100 ? "done" : "ok"} /></span>}
                  <span className="ph-row-sub">{percent === null ? uiText("No target") : percent >= 100 ? uiText("Goal reached") : <>{percent}% · <Money value={Math.max(0, (target ?? 0) - goal.total)} currency={currency} />{uiText(" to go")}</>}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {subscriptions.count > 0 && (
        <Link href="/subscriptions" className="ph-card ph-row">
          <span className="ph-icon-box"><PhoneIcon name="repeat" size={18} /></span>
          <span className="ph-row-text">
            <span className="ph-row-title">{uiText("Subscriptions")} · <Money value={subscriptions.monthly} currency={currency} />{uiText(" a month")}</span>
            {subscriptions.next && <span className="ph-row-sub">{uiText("Next")}: <span translate="no">{subscriptions.next.name}</span>, {day(subscriptions.next.on)}</span>}
          </span>
          <PhoneIcon name="chevron" size={18} strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}
