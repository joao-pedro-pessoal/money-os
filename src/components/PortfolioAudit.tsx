import { Money } from "@/components/PrivacyContext";
import type { PositionItem } from "@/lib/portfolio/positionView";
import { auditByPlatform } from "@/lib/portfolio/positionView";

/**
 * Where the headline figures come from, line by line.
 *
 * A total you can't reconcile is a total you can't trust, and "how is that
 * 177?" has no answer if the only thing on screen is 177. This shows the
 * platforms it is made of and what each contributes, so the number can be
 * checked against the broker's own app in a few seconds.
 *
 * It also surfaces the one thing that would otherwise be invisible: a platform
 * whose cash balances overlap the value of its own positions. Some report free
 * cash beside the positions (nothing overlaps); others report the whole margin
 * pool, which already backs them (it does).
 */
export default function PortfolioAudit({
  items,
  currency,
}: {
  items: PositionItem[];
  currency: string;
}) {
  const rows = auditByPlatform(items);
  if (rows.length === 0) return null;

  const overlapping = rows.filter((r) => r.mayOverlap);

  return (
    <details className="card p-4">
      <summary className="text-sm font-medium cursor-pointer">
        Where these numbers come from
      </summary>

      <p className="text-xs text-[var(--muted)] mt-2 mb-3 max-w-2xl">
        Each platform&apos;s contribution to the totals above. Compare a line against the
        broker&apos;s own app — if one disagrees, the problem is in that connection rather than in
        the arithmetic.
      </p>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Positions</th>
              <th>Market-exposed</th>
              <th>Cash &amp; stable</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.platform}>
                <td>
                  {r.platform}
                  {r.mayOverlap && (
                    <span className="text-[10px] ml-1" style={{ color: "var(--amber)" }}>
                      ⚠
                    </span>
                  )}
                </td>
                <td>{r.positions}</td>
                <td>
                  <Money value={r.floating} currency={currency} />
                </td>
                <td>
                  <Money value={r.stable} currency={currency} />
                </td>
                <td>
                  <Money value={r.total} currency={currency} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {overlapping.length > 0 && (
        <div
          className="mt-3 rounded-lg border p-3 text-xs leading-relaxed"
          style={{ borderColor: "var(--amber)", color: "var(--amber)" }}
        >
          <strong>
            {overlapping.map((r) => r.platform).join(", ")} report{" "}
            {overlapping.length === 1 ? "s" : ""} cash that already backs its own positions.
          </strong>{" "}
          On these platforms the coin balances are the margin pool, not money sitting beside the
          trades — so counting both inflates the total by roughly the margin in use. Check this
          line against the platform before trusting it.
        </div>
      )}
    </details>
  );
}
