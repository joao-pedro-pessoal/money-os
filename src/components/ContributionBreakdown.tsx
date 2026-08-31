import { getContributionBreakdown } from "@/actions/brokerImport";
import { Money } from "@/components/PrivacyContext";
import Link from "next/link";

/**
 * Money you added against money you made.
 *
 * The question a balance chart can never answer on its own. An account that
 * went from €100 to €220 after a €100 deposit grew by €20, not by 120%, and
 * only the statement's deposits and withdrawals can tell the two apart.
 */
/**
 * A figure that was not measured, in the dash the rest of the app already uses
 * for the same thing. Never `0,00` — a zero here would read as "you paid in
 * nothing", which is a different claim entirely.
 */
function NotMeasured() {
  return <span className="text-[var(--muted)]">—</span>;
}

export default async function ContributionBreakdown({ currency }: { currency: string }) {
  const b = await getContributionBreakdown();

  if (b === null) {
    return (
      <div className="card p-4">
        <div className="text-sm font-medium">Money added versus money made</div>
        <p className="text-xs text-[var(--muted)] mt-1 max-w-2xl">
          Import a broker statement and this splits the two apart. Without one there is no honest
          way to tell a deposit from a gain — a balance that rose because you paid money in looks
          exactly like a balance that rose because you did well.{" "}
          <Link href="/import" className="text-[var(--accent)]">
            Import a statement
          </Link>
        </p>
      </div>
    );
  }

  /**
   * The figures, in the base currency, or nothing.
   *
   * `flowsInBase` is null when the statement mixes currencies or when a rate is
   * missing. Rendering `b.flows` instead would put this page's currency symbol
   * in front of a number that is in another currency, or in none — which is
   * what it did before, and the reason the totals are nullable now.
   */
  const inBase = b.flowsInBase;

  return (
    <div className="card p-4">
      <div className="text-sm font-medium">Money added versus money made</div>
      <p className="text-xs text-[var(--muted)] mt-1 mb-4">
        From {b.events} statement entries across {b.accountNames.join(", ")}.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-[var(--muted)]">Paid in</div>
          <div className="text-sm mt-0.5" style={{ color: "var(--green)" }}>
            {inBase ? <Money value={inBase.deposits} currency={currency} /> : <NotMeasured />}
          </div>
        </div>
        <div>
          <div className="text-[var(--muted)]">Taken out</div>
          <div className="text-sm mt-0.5" style={{ color: "var(--red)" }}>
            {inBase ? <Money value={inBase.withdrawals} currency={currency} /> : <NotMeasured />}
          </div>
        </div>
        <div>
          <div className="text-[var(--muted)]">Net committed</div>
          <div className="text-sm mt-0.5">
            {inBase ? <Money value={inBase.net} currency={currency} /> : <NotMeasured />}
          </div>
        </div>
        <div>
          <div className="text-[var(--muted)]">Worth now</div>
          <div className="text-sm mt-0.5">
            <Money value={b.currentValue} currency={currency} />
          </div>
        </div>
      </div>

      {b.unconverted.length > 0 && (
        <p className="text-xs mt-2" style={{ color: "var(--amber)" }}>
          &ldquo;Worth now&rdquo; leaves out{" "}
          {Array.from(new Set(b.unconverted.map((u) => u.currency))).join(", ")}: no exchange rate
          yet, so those balances are missing rather than counted as {currency}.
        </p>
      )}

      {b.unavailable === "mixed_currencies" ? (
        /* Deposits in one currency and withdrawals in another do not subtract.
           The old code added them anyway and labelled the result in euros. */
        <div
          className="mt-4 rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: "var(--amber)", color: "var(--amber)" }}
        >
          <strong>This statement mixes currencies.</strong> The deposits and withdrawals arrived
          in {b.flows.currencies.join(", ")}, and money in different currencies cannot be added
          into one figure. Import one statement per currency, and each will report its own
          contributions.
        </div>
      ) : b.unavailable === "no_rate" ? (
        <div
          className="mt-4 rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: "var(--amber)", color: "var(--amber)" }}
        >
          <strong>No exchange rate for {b.flows.currency}.</strong> The statement is in{" "}
          {b.flows.currency} and this page reports in {currency}. Add a rate in Settings and the
          split appears — until then it is missing rather than guessed.
        </div>
      ) : b.growth === null ? (
        /* The honest answer when the file doesn't reach back far enough. The
           alternative — assuming the account started empty — would report a
           gain made entirely of the missing history. */
        <div
          className="mt-4 rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: "var(--amber)", color: "var(--amber)" }}
        >
          <strong>This statement doesn&apos;t reach the beginning.</strong> Running the cash
          through it goes below zero, which a broker doesn&apos;t allow — so the account already
          held at least{" "}
          <Money value={b.opening.impliedOpening} currency={currency} /> before the first entry.
          Until a statement covering the whole account is imported, the app can&apos;t say what was
          gain and what was simply already there, so it doesn&apos;t guess.
        </div>
      ) : (
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-[var(--muted)]">Actually earned</span>
            <span
              className="text-sm"
              style={{ color: b.growth.gain >= 0 ? "var(--green)" : "var(--red)" }}
            >
              <Money value={b.growth.gain} currency={currency} />
              {b.growth.returnPercent !== null && (
                <span className="text-[var(--muted)] text-xs ml-2">
                  {b.growth.returnPercent}% on what you committed
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
