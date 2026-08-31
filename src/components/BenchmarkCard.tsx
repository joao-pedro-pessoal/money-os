import { getBenchmarkComparison, getBenchmarkFreshness, refreshBenchmark, setBenchmarkChoice } from "@/actions/benchmark";
import { BENCHMARKS } from "@/lib/portfolio/benchmark";
import BenchmarkChart from "./BenchmarkChart";

/**
 * How your investing did against the market, over the same months.
 *
 * A return with nothing beside it says very little: +3,5% is good or bad
 * entirely depending on what everything else did meanwhile.
 *
 * Everything here is deliberately about the *comparison* being like-for-like.
 * The portfolio line is the time-weighted return, which removes deposits, and
 * the window is whatever that return actually measured — never a longer one for
 * the index, which would present a difference in periods as a difference in
 * performance.
 */
export default async function BenchmarkCard() {
  const [data, freshness] = await Promise.all([
    getBenchmarkComparison(),
    getBenchmarkFreshness(),
  ]);

  const refresh = async () => {
    "use server";
    await refreshBenchmark();
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div className="text-sm font-medium">Against the market</div>
        <form action={setBenchmarkChoice} className="flex items-center gap-2">
          <select
            name="benchmarkId"
            defaultValue={data.benchmark.id}
            className="input input-narrow text-xs"
          >
            {BENCHMARKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="submit" className="btn text-xs">
            Change
          </button>
        </form>
      </div>

      {/* The proxy is named, because a wrong entry in the table is not a failed
          lookup — it is a silently wrong comparison, and the only defence is
          that the symbol priced is visible enough to be checked. */}
      <p className="text-xs text-[var(--muted)] mb-4">
        Priced as {data.benchmark.symbol} — {data.benchmark.note}
      </p>

      {data.comparison === null ? (
        <>
          <div
            className="rounded-lg border p-3 text-xs leading-relaxed"
            style={{ borderColor: "var(--amber)", color: "var(--amber)" }}
          >
            {data.unavailable}
          </div>
          <form action={refresh} className="mt-3">
            <button type="submit" className="btn text-xs">
              Fetch the {data.benchmark.name} series
            </button>
            {freshness.lastDate !== null && (
              <span className="text-xs text-[var(--muted)] ml-3">
                {freshness.points} days stored, up to {freshness.lastDate}.
              </span>
            )}
          </form>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">You</div>
              <div
                className="text-lg font-semibold"
                style={{
                  color: data.comparison.portfolioReturn >= 0 ? "var(--green)" : "var(--red)",
                }}
              >
                {data.comparison.portfolioReturn >= 0 ? "+" : ""}
                {(data.comparison.portfolioReturn * 100).toFixed(2)}%
              </div>
              <div className="text-[10px] text-[var(--muted)]">deposits taken out</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">{data.benchmark.name}</div>
              <div
                className="text-lg font-semibold"
                style={{ color: data.comparison.indexReturn >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {data.comparison.indexReturn >= 0 ? "+" : ""}
                {(data.comparison.indexReturn * 100).toFixed(2)}%
              </div>
              <div className="text-[10px] text-[var(--muted)]">same window</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">Difference</div>
              <div
                className="text-lg font-semibold"
                style={{
                  color: data.comparison.differencePoints >= 0 ? "var(--green)" : "var(--red)",
                }}
              >
                {data.comparison.differencePoints >= 0 ? "+" : ""}
                {data.comparison.differencePoints.toFixed(2)} pp
              </div>
              <div className="text-[10px] text-[var(--muted)]">percentage points</div>
            </div>
          </div>

          <BenchmarkChart
            portfolio={data.comparison.portfolioCurve}
            index={data.comparison.indexCurve}
            indexName={data.benchmark.name}
          />

          <p className="text-xs text-[var(--muted)] mt-3 leading-relaxed">
            {data.comparison.from} to {data.comparison.to}, which is the window your own return
            covers — not the whole life of the portfolio. Your line has deposits and withdrawals
            removed, so it is a return rather than a balance; the index is an accumulating fund,
            so its dividends are in it too and neither side is flattered.
            {(data.comparison.indexFrom !== data.comparison.from ||
              data.comparison.indexTo !== data.comparison.to) && (
              <>
                {" "}
                The index is measured {data.comparison.indexFrom} to {data.comparison.indexTo},
                the nearest trading days inside it.
              </>
            )}
          </p>

          <form action={refresh} className="mt-3">
            <button type="submit" className="btn text-xs">
              Refresh the series
            </button>
            {freshness.lastDate !== null && (
              <span className="text-xs text-[var(--muted)] ml-3">
                Stored up to {freshness.lastDate}.
              </span>
            )}
          </form>
        </>
      )}
    </div>
  );
}
