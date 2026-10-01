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
  const month = ahead.end.toLocaleDateString("en-GB", { month: "long" });
  const until = ahead.end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const nothing = ahead.subscriptions.count + ahead.budgets.count + ahead.comingIn.count === 0;

  return (
    <section className="card p-4 space-y-3" aria-label={`Rest of ${month}`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-medium">Rest of {month}</h2>
        <span className="text-xs text-[var(--muted)]">until {until}</span>
      </div>

      {nothing ? (
        <p className="text-sm text-[var(--muted)]">
          Nothing scheduled for the rest of the month. Add{" "}
          <Link href="/subscriptions" className="text-[var(--accent)]">subscriptions</Link>,{" "}
          <Link href="/budgets" className="text-[var(--accent)]">budgets</Link> or money{" "}
          <Link href="/expected" className="text-[var(--accent)]">coming in</Link> to see it here.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Going out</div>
              <Line
                href="/subscriptions"
                label="Subscriptions"
                detail={`${ahead.subscriptions.count} charge${ahead.subscriptions.count === 1 ? "" : "s"}`}
                amount={ahead.subscriptions.total}
                sign="−"
                currency={currency}
              />
              <Line
                href="/budgets"
                label="Budgets left"
                detail={`${ahead.budgets.count} budget${ahead.budgets.count === 1 ? "" : "s"}`}
                amount={ahead.budgets.total}
                sign="−"
                currency={currency}
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Coming in</div>
              <Line
                href="/expected"
                label="Expected"
                detail={`${ahead.comingIn.count} payment${ahead.comingIn.count === 1 ? "" : "s"}`}
                amount={ahead.comingIn.total}
                sign="+"
                currency={currency}
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)] flex items-baseline justify-between gap-3 text-sm">
            <span className="text-[var(--muted)]">In minus out</span>
            <span className={`font-medium ${ahead.net < 0 ? "text-[var(--red)]" : "text-[var(--green)]"}`}>
              {ahead.net < 0 ? "−" : "+"}
              <Money value={Math.abs(ahead.net)} currency={currency} />
            </span>
          </div>
        </>
      )}

      {ahead.unconverted > 0 && (
        <p className="text-xs text-[var(--muted)]">
          {ahead.unconverted} amount{ahead.unconverted === 1 ? " is" : "s are"} in a currency with no rate yet, and left
          out.
        </p>
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
  return (
    <Link href={href} className="flex items-baseline justify-between gap-3 text-sm hover:opacity-80">
      <span>
        {label} <span className="text-xs text-[var(--muted)]">· {detail}</span>
      </span>
      <span className="tabular-nums">
        {amount > 0 ? sign : ""}
        <Money value={amount} currency={currency} />
      </span>
    </Link>
  );
}
