import { getStatementHistory } from "@/actions/brokerImport";
import { Money } from "@/components/PrivacyContext";

/**
 * The year before tracking started.
 *
 * The value chart begins when the first snapshot was taken, because a snapshot
 * is the only record of what a position was *worth* on a given day. A statement
 * reaches much further back but carries prices paid, not prices on any later
 * day — so this draws what the file can actually support and refuses to draw a
 * value line, which would have to be invented.
 */
export default async function StatementHistory() {
  const data = await getStatementHistory();
  if (data === null || data.history.length < 2) return null;

  const { history, from, to, currency } = data;
  const last = history[history.length - 1];

  const max = Math.max(
    ...history.map((h) => Math.max(Math.abs(h.contributed), h.investedAtCost)),
    1
  );

  const width = 640;
  const height = 120;
  const x = (i: number) => (i / (history.length - 1)) * width;
  const y = (v: number) => height - (v / max) * height;
  const path = (pick: (h: (typeof history)[number]) => number) =>
    history.map((h, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(pick(h)).toFixed(1)}`).join(" ");

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="text-sm font-medium">Before tracking started</div>
        <div className="text-xs text-[var(--muted)]">
          {from} to {to}, from the imported statement
        </div>
      </div>

      <p className="text-xs text-[var(--muted)] mt-1 mb-4 max-w-2xl">
        The chart above starts when the app took its first snapshot. This one reaches back to your
        first statement entry — but it can only show what the file records: money committed, what
        purchases cost, and income received. What those holdings were <em>worth</em> on any day
        before tracking began isn&apos;t in the statement, and the app won&apos;t make it up.
      </p>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 120 }}>
        <path
          d={path((h) => h.investedAtCost)}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
        />
        <path
          d={path((h) => Math.abs(h.contributed))}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
      </svg>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 text-xs">
        <div>
          <div className="text-[var(--accent)]">Cost of purchases</div>
          <div className="text-sm mt-0.5">
            <Money value={last.investedAtCost} currency={currency} />
          </div>
        </div>
        <div>
          <div className="text-[var(--muted)]">Net committed</div>
          <div className="text-sm mt-0.5">
            <Money value={last.contributed} currency={currency} />
          </div>
        </div>
        <div>
          <div className="text-[var(--muted)]">Income received</div>
          <div className="text-sm mt-0.5" style={{ color: "var(--green)" }}>
            <Money value={last.incomeReceived} currency={currency} />
          </div>
        </div>
        <div>
          <div className="text-[var(--muted)]">Fees paid</div>
          <div className="text-sm mt-0.5">
            <Money value={last.feesPaid} currency={currency} />
          </div>
        </div>
      </div>
    </div>
  );
}
