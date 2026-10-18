"use client";

import { useText } from "@/components/useText";
import { useLanguage } from "./LanguageContext";
import { localeOf } from "@/lib/i18n/languages";
import Link from "next/link";
import { Money } from "./PrivacyContext";
import type { MonthAhead } from "@/lib/accounting/monthAhead";

/**
 * The rest of the month in one card: what is due to leave, what is due to
 * arrive, and the difference. Every figure is a forecast (lib/accounting/
 * monthAhead.ts) and links to the page where it is kept.
 *
 * Amounts arrive already in the currency the dashboard shows.
 */
export default function MonthAheadCard({ ahead, currency }: { ahead: MonthAhead; currency: string }) {
  const uiText = useText();
  const { language } = useLanguage();
  const month = ahead.end.toLocaleDateString(localeOf(language), { month: "long" });
  const until = ahead.end.toLocaleDateString(localeOf(language), { day: "numeric", month: "short" });
  const nothing = ahead.subscriptions.count + ahead.budgets.count + ahead.comingIn.count === 0;

  return (
    <section className="card p-4 space-y-3" aria-label={uiText("Rest of {0}", { "0": month })}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-medium">{uiText("Rest of ")}{month}</h2>
        <span className="text-xs text-[var(--muted)]">{uiText("until ")}{until}</span>
      </div>

      {nothing ? (
        <p className="text-sm text-[var(--muted)]">{uiText("Nothing scheduled for the rest of the month. Add")}{" "}
          <Link href="/subscriptions" className="text-[var(--accent)]">{uiText("subscriptions")}</Link>,{" "}
          <Link href="/budgets" className="text-[var(--accent)]">{uiText("budgets")}</Link>{uiText(" or money")}{" "}
          <Link href="/expected" className="text-[var(--accent)]">{uiText("coming in")}</Link>{uiText(" to see it here.")}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{uiText("Going out")}</div>
              <Line
                href="/subscriptions"
                label={uiText("Subscriptions")}
                detail={uiText(ahead.subscriptions.count === 1 ? "{count} charge" : "{count} charges", { count: ahead.subscriptions.count })}
                amount={ahead.subscriptions.total}
                sign="−"
                currency={currency}
              />
              <Line
                href="/budgets"
                label={uiText("Budgets left")}
                detail={uiText(ahead.budgets.count === 1 ? "{count} budget" : "{count} budgets", { count: ahead.budgets.count })}
                amount={ahead.budgets.total}
                sign="−"
                currency={currency}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{uiText("Coming in")}</div>
              <Line
                href="/expected"
                label={uiText("Expected")}
                detail={uiText(ahead.comingIn.count === 1 ? "{count} payment" : "{count} payments", { count: ahead.comingIn.count })}
                amount={ahead.comingIn.total}
                sign="+"
                currency={currency}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-baseline justify-between gap-3 text-sm">
            <span className="text-[var(--muted)]">{uiText("In minus out")}</span>
            <span className={`font-medium ${ahead.net < 0 ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
              {ahead.net < 0 ? "−" : "+"}
              <Money value={Math.abs(ahead.net)} currency={currency} />
            </span>
          </div>
        </>
      )}

      {ahead.unconverted > 0 && (
        <p className="text-xs text-[var(--muted)]">
          {ahead.unconverted}{uiText(" amount")}{ahead.unconverted === 1 ? uiText(" is") : uiText("s are")}{uiText(" in a currency with no rate yet, and left out.")}</p>
      )}
    </section>
  );
}

function Line({
  href,
  label,
  detail,
  amount,
  sign,
  currency,
}: {
  href: string;
  label: string;
  detail: string;
  amount: number;
  sign: "+" | "−";
  currency: string;
}) {
  const uiText = useText();
  return (
    <Link href={href} className="flex items-baseline justify-between gap-3 text-sm hover:opacity-80">
      <span>
        {uiText(label ?? "")} <span className="text-xs text-[var(--muted)]">· {detail}</span>
      </span>
      <span className="tabular-nums">
        {amount > 0 ? sign : ""}
        <Money value={amount} currency={currency} />
      </span>
    </Link>
  );
}
