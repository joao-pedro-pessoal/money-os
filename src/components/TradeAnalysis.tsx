"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { Fragment, useState } from "react";
import { fmt } from "@/lib/format";
import type {
  PnlPoint,
  SymbolStats,
  DirectionStats,
  CadencePoint,
  HourBucket,
  HoldingSummary,
  TagStats,
  TaggedTotals,
} from "@/lib/trading/stats";
import { TRADE_GROUPINGS, type TradeGrouping } from "@/lib/trading/filter";

/**
 * Four questions about how you trade, each with its own chart.
 *
 * The one design rule running through all of them: **fees are never folded
 * into the result.** On a small account they routinely exceed what the trading
 * made, and a single "P&L" line would show a near-breakeven quarter where the
 * account actually shrank. Every panel that shows a result shows what it cost
 * beside it.
 */

const GREEN = "var(--green)";
const RED = "var(--red)";
const AMBER = "var(--amber)";
const MUTED = "var(--muted)";

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-[10px] text-[var(--muted)] mb-3">{subtitle}</div>
      {children}
    </div>
  );
}

function Empty({ what }: { what: string }) {
  return <div className="text-xs text-[var(--muted)] py-10 text-center">{what}</div>;
}

/** Hours read as hours until they don't. */
function duration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} days`;
}

export default function TradeAnalysis({
  pnl,
  symbols,
  directions,
  months,
  hours,
  holding,
  averageSize,
  grouped,
  coverage,
  grouping,
  onGrouping,
  tradeCount,
  closedCount,
  currency,
  approximate,
  unconvertible,
}: {
  pnl: PnlPoint[];
  symbols: SymbolStats[];
  directions: DirectionStats[];
  months: CadencePoint[];
  hours: HourBucket[];
  holding: HoldingSummary;
  averageSize: number | null;
  grouped: TagStats[];
  coverage: TaggedTotals;
  grouping: TradeGrouping;
  onGrouping: (next: TradeGrouping) => void;
  tradeCount: number;
  closedCount: number;
  currency: string;
  approximate: boolean;
  unconvertible: number;
}) {
  /** Which group is opened. Local state: nothing else on the page reads it. */
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  if (tradeCount === 0) {
    return (
      <div className="card p-8 text-center text-sm text-[var(--muted)]">
        No trades in the history yet. Sync a connected platform, or import a statement below.
      </div>
    );
  }

  const last = pnl[pnl.length - 1];
  const money = (v: number) => fmt(v, currency);
  // Ten is enough to see the pattern; a long tail of one-off trades buries it.
  const topSymbols = [...symbols].filter((s) => s.closedTrades > 0).slice(0, 10);

  return (
    <div className="space-y-4">
      {(approximate || unconvertible > 0) && (
        <div className="text-[10px] text-[var(--muted)]">
          {approximate &&
            "Trades in other currencies are converted at today's rate, so figures before today are approximate. "}
          {unconvertible > 0 &&
            `${unconvertible} row${unconvertible === 1 ? "" : "s"} left out: no exchange rate available.`}
        </div>
      )}

      {/* ---- 1. Am I winning or losing? ---- */}
      <Panel
        title="Realised result over time"
        subtitle="What closed trades made, what they cost in fees, and what is left. Only the last line is money you keep."
      >
        {last && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <div className="text-[10px] text-[var(--muted)]">Closed trades made</div>
              <div
                className="text-lg font-semibold"
                style={{ color: last.realized >= 0 ? GREEN : RED }}
              >
                {money(last.realized)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--muted)]">Fees paid</div>
              <div className="text-lg font-semibold" style={{ color: AMBER }}>
                {money(last.fees)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--muted)]">Net</div>
              <div
                className="text-lg font-semibold"
                style={{ color: last.net >= 0 ? GREEN : RED }}
              >
                {money(last.net)}
              </div>
            </div>
          </div>
        )}
        {pnl.length < 2 ? (
          <Empty what="One day of trades so far — a line needs two." />
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={pnl} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: MUTED }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} width={48} />
                {/* Where the account is neither up nor down. */}
                <ReferenceLine y={0} stroke="var(--border-strong)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    fontSize: 11,
                  }}
                  formatter={(v, name) => [money(Number(v ?? 0)), String(name ?? "")]}
                />
                <Line
                  type="monotone"
                  dataKey="realized"
                  name="Trading result"
                  stroke={MUTED}
                  strokeDasharray="4 3"
                  dot={false}
                />
                <Line type="monotone" dataKey="fees" name="Fees" stroke={AMBER} dot={false} />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Net"
                  stroke={last && last.net >= 0 ? GREEN : RED}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      {/* ---- Result by what kind of trade it was ---- */}
      <Panel
        title="Result by kind of trade"
        subtitle="Not what you traded, but what kind of thing it was — the classification you gave the instrument, kept after you sold out of it."
      >
        <div className="flex gap-2 flex-wrap mb-3">
          {TRADE_GROUPINGS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => onGrouping(g.key)}
              className="badge border text-xs"
              style={{
                borderColor: grouping === g.key ? "var(--accent)" : "var(--border)",
                color: grouping === g.key ? "var(--accent)" : "var(--muted)",
              }}
            >
              {g.label}
            </button>
          ))}
        </div>

        {grouped.length === 0 ? (
          <Empty
            what={
              coverage.untagged === 0
                ? "Nothing closed yet to group."
                : `None of your ${coverage.untagged} closed trades are classified this way yet. Set it in the Tags column below — it is kept after you sell out, and after every re-sync.`
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table whitespace-nowrap">
                <thead>
                  <tr>
                    <th>{TRADE_GROUPINGS.find((g) => g.key === grouping)?.label ?? "Group"}</th>
                    <th className="text-right">Closed</th>
                    <th className="text-right">Win rate</th>
                    <th className="text-right">Realized</th>
                    <th className="text-right">Net after fees</th>
                    <th className="text-right">Best</th>
                    <th className="text-right">Worst</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((t) => (
                    <Fragment key={t.tag}>
                    <tr>
                      <td>
                        {/* Opening a group shows the trades the row was summed
                            from — carried on the group rather than fetched
                            again, so the detail cannot disagree with the total
                            it sits under. */}
                        <button
                          type="button"
                          onClick={() => setOpenGroup(openGroup === t.tag ? null : t.tag)}
                          className="hover:underline text-left"
                        >
                          {openGroup === t.tag ? "▾ " : "▸ "}
                          {t.tag}
                        </button>
                      </td>
                      <td className="text-right">{t.closedTrades}</td>
                      <td className="text-right">
                        {t.winRate === null ? "—" : `${t.winRate.toFixed(0)}%`}
                      </td>
                      <td
                        className={`text-right ${t.realized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                      >
                        {money(t.realized)}
                      </td>
                      <td
                        className={`text-right ${t.net >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                      >
                        {money(t.net)}
                      </td>
                      <td className="text-right text-[var(--green)]">{money(t.best)}</td>
                      <td className="text-right text-[var(--red)]">{money(t.worst)}</td>
                    </tr>

                    {openGroup === t.tag &&
                      t.trades.map((trade, i) => (
                        <tr key={`${t.tag}-${i}`} style={{ background: "var(--surface-2)" }}>
                          {/* Indented, so a trade reads as belonging to the
                              group above rather than as a group of its own. */}
                          <td className="pl-8">
                            <span className="text-[var(--muted)]">{trade.date.slice(0, 10)}</span>{" "}
                            {trade.symbol ?? "—"}
                          </td>
                          {/* Under "Closed" and "Win rate", which count trades
                              — a single trade has nothing to say there. */}
                          <td />
                          <td />
                          <td
                            className={`text-right ${trade.realized >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                          >
                            {money(trade.realized)}
                          </td>
                          <td
                            className={`text-right ${trade.net >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
                          >
                            {money(trade.net)}
                          </td>
                          {/* Best and worst are properties of a group, not of
                              one trade. The fee it paid is the useful thing to
                              put here instead, and it is why net differs from
                              realised. */}
                          <td className="text-right text-[var(--muted)]" colSpan={2}>
                            {trade.fees === null || trade.fees === 0
                              ? "no fee recorded"
                              : `${money(trade.fees)} in fees`}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/*
              Every axis here is single-valued, so these rows really do add up
              to the classified total — which is why the coverage has to be
              stated: they are a breakdown of the classified trades, not of all
              of them, and the difference is 35 trades on this account.
            */}
            <p className="text-[10px] text-[var(--muted)] mt-2 leading-relaxed whitespace-normal max-w-prose">
              These cover{" "}
              <span className="text-[var(--foreground)]">
                {coverage.tagged} of {coverage.tagged + coverage.untagged} closed trades
              </span>
              , worth {money(coverage.realized)}
              {coverage.untagged > 0 && (
                <>
                  {" "}
                  — the other {coverage.untagged} are not classified this way, so they are in no
                  row above
                </>
              )}
              .
            </p>
          </>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ---- 2. What do I trade well? ---- */}
        <Panel
          title="Result by instrument"
          subtitle="After fees, which is what decides whether to keep trading it."
        >
          {topSymbols.length === 0 ? (
            <Empty what="Nothing closed yet." />
          ) : (
            <>
              <div style={{ width: "100%", height: Math.max(140, topSymbols.length * 28) }}>
                <ResponsiveContainer>
                  <BarChart
                    data={topSymbols}
                    layout="vertical"
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: MUTED }} />
                    <YAxis
                      type="category"
                      dataKey="symbol"
                      tick={{ fontSize: 10, fill: MUTED }}
                      width={70}
                    />
                    <ReferenceLine x={0} stroke="var(--border-strong)" />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        fontSize: 11,
                      }}
                      formatter={(v) => money(Number(v ?? 0))}
                    />
                    <Bar dataKey="net" name="Net after fees">
                      {topSymbols.map((s) => (
                        <Cell key={s.symbol} fill={s.net >= 0 ? GREEN : RED} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto mt-3">
                <table className="data-table text-xs whitespace-nowrap">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th className="text-right">Closed</th>
                      <th className="text-right">Win rate</th>
                      <th className="text-right">Result</th>
                      <th className="text-right">Fees</th>
                      <th className="text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topSymbols.map((s) => (
                      <tr key={s.symbol}>
                        <td className="font-medium">{s.symbol}</td>
                        <td className="text-right">{s.closedTrades}</td>
                        <td className="text-right">
                          {s.winRate === null ? "—" : `${s.winRate.toFixed(0)}%`}
                        </td>
                        <td
                          className="text-right"
                          style={{ color: s.realized >= 0 ? GREEN : RED }}
                        >
                          {money(s.realized)}
                        </td>
                        <td className="text-right" style={{ color: AMBER }}>
                          {money(s.fees)}
                        </td>
                        <td className="text-right" style={{ color: s.net >= 0 ? GREEN : RED }}>
                          {money(s.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        {/* ---- 4. How long do I hold? ---- */}
        <Panel
          title="How long you hold"
          subtitle="Winners against losers. Holding losers longer is the pattern a P&L total cannot show you."
        >
          {holding.count === 0 ? (
            <Empty what="No round trips matched yet." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] text-[var(--muted)]">Winners, typically</div>
                  <div className="text-xl font-semibold" style={{ color: GREEN }}>
                    {duration(holding.winnersMedianHours)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[var(--muted)]">Losers, typically</div>
                  <div className="text-xl font-semibold" style={{ color: RED }}>
                    {duration(holding.losersMedianHours)}
                  </div>
                </div>
              </div>
              {holding.winnersMedianHours !== null &&
                holding.losersMedianHours !== null &&
                holding.losersMedianHours > holding.winnersMedianHours * 1.5 && (
                  <p className="text-[10px] mt-3" style={{ color: AMBER }}>
                    You hold losing trades noticeably longer than winning ones. That is the
                    textbook shape of cutting winners early and hoping losers come back.
                  </p>
                )}
              <div className="text-[10px] text-[var(--muted)] mt-3">
                Median across {holding.count} matched round trip
                {holding.count === 1 ? "" : "s"}, oldest lot first. A median rather than an
                average, so one long-held position cannot carry it.
              </div>
            </>
          )}

          {directions.length > 0 && (
            <div className="mt-4 pt-3 border-t border-[var(--border)]">
              <div className="text-[10px] text-[var(--muted)] mb-2">By direction</div>
              <table className="data-table text-xs w-full">
                <tbody>
                  {directions.map((d) => (
                    <tr key={d.direction}>
                      <td className="capitalize">{d.direction}</td>
                      <td className="text-right text-[var(--muted)]">{d.closedTrades} closed</td>
                      <td className="text-right text-[var(--muted)]">
                        {d.winRate === null ? "—" : `${d.winRate.toFixed(0)}% won`}
                      </td>
                      <td className="text-right" style={{ color: d.net >= 0 ? GREEN : RED }}>
                        {money(d.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* ---- 3. How often, and when? ---- */}
      <Panel
        title="How often you trade"
        subtitle="Trades per month, and the hour of day they land. Hours are UTC — the app has no reliable answer for where you were."
      >
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <div className="text-[10px] text-[var(--muted)]">Trades</div>
            <div className="text-lg font-semibold">{tradeCount}</div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--muted)]">Of those, closing</div>
            <div className="text-lg font-semibold">{closedCount}</div>
          </div>
          <div>
            <div className="text-[10px] text-[var(--muted)]">Typical size</div>
            <div className="text-lg font-semibold">
              {averageSize === null ? "—" : money(averageSize)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={months} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: MUTED }} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} width={30} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="trades" name="Trades" fill="var(--accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={hours} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: MUTED }} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: MUTED }} width={30} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    fontSize: 11,
                  }}
                  labelFormatter={(h) => `${h}:00 UTC`}
                />
                <Bar dataKey="trades" name="Trades" fill="var(--accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>
    </div>
  );
}
