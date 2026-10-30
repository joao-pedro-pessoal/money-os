import Link from "next/link";
import { Money } from "./PrivacyContext";

export type ProgressTone = "good" | "close" | "over";

const TONE_COLOR: Record<ProgressTone, string> = {
  good: "var(--green)",
  close: "var(--amber)",
  over: "var(--red)",
};

/**
 * Amount against a ceiling or a target, one bar per row: budgets spent of their
 * limit, buckets filled toward their goal. A bar reads at a glance where a pair
 * of numbers has to be compared. Without a target the row shows its amount only.
 */
export default function ProgressBars({
  items,
  currency,
}: {
  items: { id: string; name: string; href?: string; value: number; max: number | null; tone?: ProgressTone }[];
  currency: string;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const share = item.max && item.max > 0 ? Math.min(100, (item.value / item.max) * 100) : null;
        const name = <span translate="no" className="truncate">{item.name}</span>;
        return (
          <li key={item.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {item.href ? <Link href={item.href} className="hover:underline min-w-0 flex">{name}</Link> : name}
              <span className="shrink-0 tabular-nums text-xs">
                <Money value={item.value} currency={currency} />
                {item.max !== null && <span className="text-[var(--muted)]"> / <Money value={item.max} currency={currency} /></span>}
              </span>
            </div>
            {share !== null && (
              <div className="h-1.5 mt-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }} aria-hidden="true">
                <div className="h-full rounded-full" style={{ width: `${share}%`, background: TONE_COLOR[item.tone ?? "good"] }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A budget's bar colour: red when spent past it, amber when close or running ahead of the calendar. */
export function budgetTone(budget: { status: string; pacingOver?: boolean }): ProgressTone {
  return budget.status === "over" ? "over" : budget.status === "close" || budget.pacingOver ? "close" : "good";
}
