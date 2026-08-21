import { getPricingCrossCheck } from "@/actions/quotes";
import { fmt } from "@/lib/format";

/**
 * Does the sum of the parts agree with the whole?
 *
 * The account declares what it is worth; the priced instruments add up to
 * something. Two independent measurements of one number, and a disagreement
 * between them is the only signal that a listing was matched wrongly — because
 * a wrong match returns a real price for a real instrument, and the row itself
 * looks perfect.
 */
export default async function PricingCrossCheck() {
  const rows = await getPricingCrossCheck();
  const worth = rows.filter((r) => r.check !== null);
  if (worth.length === 0) return null;

  return (
    <div className="space-y-2">
      {worth.map(({ accountId, accountName, currency, check }) => {
        if (!check) return null;

        return (
          <div
            key={accountId}
            className="card p-4"
            style={check.suspicious ? { borderLeft: "2px solid var(--amber)" } : undefined}
          >
            <div className="text-sm font-medium mb-1">
              {check.suspicious ? "These prices don't add up" : "Prices agree with the account"}
            </div>

            <p className="text-xs text-[var(--muted)] leading-snug">
              {accountName} says it holds{" "}
              <span className="text-[var(--foreground)]">{fmt(check.declared, currency)}</span>. The
              instruments come to{" "}
              <span className="text-[var(--foreground)]">{fmt(check.estimate, currency)}</span>
              {check.unpricedCount > 0 && (
                <>
                  {" "}
                  ({fmt(check.pricedValue, currency)} priced, plus {check.unpricedCount} still at
                  cost)
                </>
              )}
              .
            </p>

            {check.suspicious ? (
              <p className="text-xs mt-2 leading-snug" style={{ color: "var(--amber)" }}>
                They differ by {fmt(Math.abs(check.difference), currency)}
                {check.percent !== null && ` (${Math.abs(check.percent).toFixed(1)}%)`}, which is
                more than a few days of market movement. The likeliest cause is a price matched to
                the wrong listing — the same fund on another exchange, or a different share class.
                Both are real instruments with real prices, so the wrong one looks entirely normal
                on its own row. Check the symbols on the Positions page against what your broker
                shows.
              </p>
            ) : (
              <p className="text-[10px] text-[var(--muted)] mt-2 leading-snug">
                Within a few percent, which is ordinary movement between the day you last updated
                the balance and the day these prices were fetched. Two independent routes to the
                same figure agreeing is the best evidence available that the listings are right.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
