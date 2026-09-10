/**
 * Turning a statement's positions into ones you can edit.
 *
 * A reconstruction is a replay of a file, so there is nothing in it to change.
 * That is fine for the numbers and useless for everything else a position has:
 * an asset type, a playlist, a risk level, a price you keep current. This makes
 * them ordinary holdings with those doors open, seeded from what the statement
 * proves.
 *
 * Safe to press twice — matched on ISIN, so a second run corrects the
 * quantities and leaves every tag alone.
 */
export default function AdoptStatementPositions({
  accounts,
  action,
}: {
  accounts: { accountId: string; accountName: string; instruments: number }[];
  /** Wrapped by the page: a form action may not return a value. */
  action: (formData: FormData) => Promise<void>;
}) {
  const usable = accounts.filter((a) => a.instruments > 0);
  if (usable.length === 0) return null;

  return (
    <div className="card p-4">
      <div className="text-sm font-medium mb-1">Make these positions editable</div>
      <p className="text-xs text-[var(--muted)] leading-snug mb-3">
        Your statement knows the quantities and what you paid, but a replayed file has nothing you
        can change. This creates a real position for each instrument, opened at its cost, so you can
        tag it, put it in a playlist and keep its price up to date like any other.
      </p>

      <div className="space-y-2">
        {usable.map((a) => (
          <form key={a.accountId} action={action} className="flex items-center gap-3">
            <input type="hidden" name="accountId" value={a.accountId} />
            <span className="text-xs flex-1 truncate">
              {a.accountName}
              <span className="text-[var(--muted)]">
                {" "}
                · {a.instruments} instrument{a.instruments === 1 ? "" : "s"}
              </span>
            </span>
            <button type="submit" className="btn text-xs whitespace-nowrap">
              Create positions
            </button>
          </form>
        ))}
      </div>

      <p className="text-[10px] text-[var(--muted)] mt-3 leading-snug">
        Nothing is added to your net worth: the account&apos;s balance already contains these, and it
        says so. They open at cost, showing no profit until you set a current price — a made-up
        opening price would show a gain nobody measured.
      </p>
    </div>
  );
}
