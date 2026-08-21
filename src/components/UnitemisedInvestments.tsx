import Link from "next/link";
import { Money } from "@/components/PrivacyContext";

/**
 * The investments this page can't show.
 *
 * An account that declares part of its balance as invested contributes to Net
 * Worth but has nothing to put in a table of instruments. Without this card the
 * difference between the dashboard's total and the table below it is invisible,
 * and an invisible difference of a few hundred euros reads as a bug in the app
 * rather than as a gap in what the app has been told.
 *
 * The remedy is one import away, so the card links to it.
 */
export default function UnitemisedInvestments({
  items,
  total,
  currency,
}: {
  items: {
    id: string;
    name: string;
    institution: string;
    amount: number;
    currency: string;
    itemised: boolean;
  }[];
  total: number;
  currency: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-sm font-medium">Invested, but not itemised</div>
        <div className="text-sm font-semibold">
          <Money value={total} currency={currency} />
        </div>
      </div>

      <p className="text-xs text-[var(--muted)] leading-snug mb-3">
        This money is counted in your net worth and in the investments total. It isn&apos;t in the
        table below because the app knows how much is invested, not what it is invested in.
      </p>

      <ul className="space-y-1.5">
        {items.map((a) => (
          <li key={a.id} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate">
              {a.institution} — {a.name}
              {a.itemised && (
                <span className="text-[var(--muted)]"> · some instruments already recorded</span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              <Money value={a.amount} currency={a.currency} />
            </span>
          </li>
        ))}
      </ul>

      <div className="text-[10px] text-[var(--muted)] mt-3 leading-snug">
        Import the broker&apos;s transaction export and the individual positions appear here, rebuilt
        from your own buys and sells.{" "}
        <Link href="/import" className="text-[var(--accent)]">
          Import a statement
        </Link>
      </div>
    </div>
  );
}
