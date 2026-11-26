import { Money } from "./PrivacyContext";
import { changeFromLastMonth } from "@/lib/ui/phoneSummary";
import type { TextTranslator } from "@/lib/i18n/text";

/**
 * What was spent month by month, newest last (F30). The bars only compare the
 * months with each other; the figure above them is the current month so far.
 * Money with no exchange rate is left out, and said.
 */
export default function PhoneSpendingChart({ months, currency, missing, uiText, locale }: {
  months: { start: Date; total: number }[]; currency: string; missing: number; uiText: TextTranslator; locale: string;
}) {
  if (months.length === 0) return null;
  const current = months[months.length - 1];
  const highest = Math.max(...months.map(m => m.total), 1);
  const change = changeFromLastMonth(months);
  const name = (date: Date, style: "long" | "short") => date.toLocaleDateString(locale, { month: style });
  const previous = months.length > 1 ? name(months[months.length - 2].start, "long") : "";
  return (
    <section className="ph-card ph-chart" aria-labelledby="ph-chart-title">
      <div className="ph-chart-head">
        <span>
          <span id="ph-chart-title" className="ph-sub">{uiText("Spent in {0}", { "0": name(current.start, "long") })}</span>
          <strong className="ph-chart-total"><Money value={current.total} currency={currency} /></strong>
        </span>
        {change !== null && change !== 0 && (
          <span className={`ph-chip-tone${change < 0 ? " ph-chip-good" : ""}`}>
            {uiText(change < 0 ? "{0}% less than {1}" : "{0}% more than {1}", { "0": Math.abs(change), "1": previous })}
          </span>
        )}
      </div>
      <ol className="ph-bars">
        {months.map((month, i) => {
          const last = i === months.length - 1;
          return (
            <li key={month.start.toISOString()} data-current={last || undefined}>
              <span className="ph-bars-bar" style={{ height: `${Math.max(3, Math.round((month.total / highest) * 78))}%` }} />
              <span className="ph-bars-label">{name(month.start, "short")}</span>
              <span className="sr-only"><Money value={month.total} currency={currency} /></span>
            </li>
          );
        })}
      </ol>
      {missing > 0 && <p className="ph-sub">{uiText("Some entries have no exchange rate and are left out.")}</p>}
    </section>
  );
}
