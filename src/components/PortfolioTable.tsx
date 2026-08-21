"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DonutChart from "@/components/DonutChart";
import { fmt } from "@/lib/format";
import { tagLabel } from "@/lib/portfolio/tags";
import {
  groupItems,
  applyFilters,
  filterOptions,
  allocationOf,
  hasPnl,
  yearlyYield,
  GROUP_OPTIONS,
  NO_FILTERS,
  UNTAGGED,
  type PositionItem,
  type GroupKey,
  type Filters,
} from "@/lib/portfolio/positionView";

/**
 * Everything you hold, grouped however you want to look at it.
 *
 * The tags were only visible on the Positions page, which is where you set
 * them and not where you look at them. And the allocation chart counted
 * manually-added holdings only, so an account entirely synced showed "No data
 * yet" while holding real money.
 *
 * The chart is driven by the same filtered set as the table, so what you see
 * and what it measures can't drift apart.
 */
export default function PortfolioTable({
  items,
  currency,
}: {
  items: PositionItem[];
  currency: string;
}) {
  /**
   * Column widths in percent, draggable.
   *
   * Fixed widths were a guess that suited my test data and not your symbols —
   * "Interactive Brokers" was truncated to "Interactive …" for every row.
   * Dragging beats me guessing better.
   */
  const [widths, setWidths] = useState<number[]>([24, 16, 20, 16, 14, 10]);
  const dragging = useRef<{ index: number; startX: number; startW: number; nextW: number } | null>(
    null
  );

  const onMove = useCallback((e: MouseEvent) => {
    const d = dragging.current;
    if (!d) return;
    // Percent of the table, so the layout stays fluid at any window size.
    const table = document.getElementById("portfolio-table");
    const width = table?.clientWidth ?? 1;
    const delta = ((e.clientX - d.startX) / width) * 100;
    // A column can't eat its neighbour entirely; 6% keeps a header readable.
    const grow = Math.max(-d.startW + 6, Math.min(d.nextW - 6, delta));
    setWidths((w) => {
      const next = [...w];
      next[d.index] = d.startW + grow;
      next[d.index + 1] = d.nextW - grow;
      return next;
    });
  }, []);

  const onUp = useCallback(() => {
    dragging.current = null;
    document.body.style.cursor = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onMove, onUp]);

  const startDrag = (index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = {
      index,
      startX: e.clientX,
      startW: widths[index],
      nextW: widths[index + 1],
    };
    document.body.style.cursor = "col-resize";
  };

  const [group, setGroup] = useState<GroupKey>("assetType");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const options = useMemo(() => filterOptions(items), [items]);
  const filtered = useMemo(() => applyFilters(items, filters), [items, filters]);
  const groups = useMemo(() => groupItems(filtered, group), [filtered, group]);
  const allocation = useMemo(() => allocationOf(filtered, group), [filtered, group]);

  const total = filtered.reduce((s, i) => s + i.value, 0);
  const totalNotional = filtered.reduce((s, i) => s + i.notional, 0);
  const totalPnl = filtered.reduce((s, i) => s + i.pnl, 0);
  /**
   * Positions with no price yet.
   *
   * They contribute nothing to the P&L total, which is right — but a total that
   * silently leaves rows out is the same shape as one that counts them at zero,
   * and only one of those is honest. The count is shown beside it.
   */
  const unpriced = filtered.filter((i) => i.atCost);
  const hidden = items.length - filtered.length;

  const set = (patch: Partial<Filters>) => setFilters({ ...filters, ...patch });

  const label = (value: string) => (value === UNTAGGED ? "Untagged" : tagLabel(value) ?? value);

  const dropdown = (
    key: keyof Filters,
    all: string,
    values: string[]
  ) => (
    <select
      value={filters[key]}
      onChange={(e) => set({ [key]: e.target.value } as Partial<Filters>)}
      className="input input-narrow text-xs py-1"
    >
      <option value="">{all}</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {label(v)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">Group by</span>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as GroupKey)}
            className="input input-narrow text-xs py-1"
          >
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          {showFilters ? "Hide filters" : "Filters"}
        </button>
      </div>

      {showFilters && (
        <div className="flex gap-2 flex-wrap items-center pb-3 border-b border-[var(--border)]">
          <input
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search"
            className="input input-narrow text-xs py-1 w-40"
          />
          {dropdown("assetType", "All types", options.assetTypes)}
          {dropdown("playlist", "All playlists", options.playlists)}
          {dropdown("riskLevel", "All risk", options.riskLevels)}
          {dropdown("account", "All accounts", options.accounts)}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setFilters(NO_FILTERS)}
              className="text-xs text-[var(--accent)] hover:underline ml-auto"
            >
              Clear ({hidden} hidden)
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <div className="min-w-0">
          <table
            id="portfolio-table"
            className="data-table w-full"
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              {widths.map((w, i) => (
                <col key={i} style={{ width: `${w}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {["Symbol", "Type", "Playlist", "Account", "At risk", "P&L"].map((h, i) => (
                  <th
                    key={h}
                    className={i >= 4 ? "text-right" : undefined}
                    style={{ position: "relative" }}
                  >
                    {h}
                    {/* Drag the edge between two columns. The pair shares a
                        fixed total, so widening one narrows its neighbour and
                        the table never overflows into a scrollbar. */}
                    {i < widths.length - 1 && (
                      <span
                        onMouseDown={startDrag(i)}
                        title="Drag to resize"
                        style={{
                          position: "absolute",
                          top: 0,
                          right: -4,
                          width: 8,
                          height: "100%",
                          cursor: "col-resize",
                          userSelect: "none",
                        }}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.key || "all"}>
                  {group !== "none" && (
                    <tr style={{ background: "var(--surface-2)" }}>
                      <td colSpan={4} className="font-medium text-xs">
                        {label(g.key)}
                        <span className="text-[var(--muted)] ml-2">
                          {g.items.length} · {g.percent}%
                        </span>
                      </td>
                      <td className="text-right font-medium text-xs">{fmt(g.value, currency)}</td>
                      <td
                        className="text-right text-xs"
                        style={{ color: g.pnl >= 0 ? "var(--green)" : "var(--red)" }}
                      >
                        {g.pnl >= 0 ? "+" : "−"}
                        {fmt(Math.abs(g.pnl), currency)}
                      </td>
                    </tr>
                  )}
                  {g.items.map((i) => (
                    <tr key={i.id}>
                      <td className="font-medium">
                        <span className="break-all">{i.symbol}</span>
                        {i.side === "short" && (
                          <span className="badge ml-1 text-[var(--red)] border border-[var(--red)]">
                            SHORT
                          </span>
                        )}
                        {/* Already inside the account balance, so it's shown
                            but never added on top of it. */}
                        {i.insideBalance && (
                          <span
                            className="text-[10px] text-[var(--muted)] ml-1"
                            title="Part of the account balance, not money on top of it. Counted once, in Net Worth."
                          >
                            in balance
                          </span>
                        )}
                        {/* The value in this row is what it cost, not what it
                            is worth. Said on the row itself, because a column
                            of market values with one cost hidden among them is
                            worse than no column at all. */}
                        {i.atCost && (
                          <span
                            className="text-[10px] ml-1"
                            style={{ color: "var(--amber)" }}
                            title="Rebuilt from an imported statement. The quantity is exact; the figure shown is what you paid, because the statement carries no current price."
                          >
                            at cost
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-[var(--muted)]">
                        {i.assetType ? (
                          tagLabel(i.assetType) ?? i.assetType
                        ) : (
                          <Link href="/positions" className="text-[var(--accent)] hover:underline">
                            set type
                          </Link>
                        )}
                      </td>
                      <td className="text-xs text-[var(--muted)] truncate" title={i.playlistName ?? undefined}>
                        {i.playlistName ?? "—"}
                      </td>
                      <td className="text-xs text-[var(--muted)] truncate" title={i.accountName}>
                        {i.accountName}
                      </td>
                      <td className="text-right">
                        {fmt(i.value, currency)}
                        {/* Leverage means the position controls far more than
                            it cost you. Showing the notional as "value" would
                            overstate the portfolio by the leverage factor. */}
                        {i.leverage !== null && i.leverage > 1 && (
                          <div className="text-[10px] text-[var(--muted)]">
                            {i.leverage}× · {fmt(i.notional, currency)}
                          </div>
                        )}
                      </td>
                      {/* Cash and stablecoins have no P&L: the price doesn't
                          move. A column of +0,00 € invites you to read a
                          number that means nothing. */}
                      {!hasPnl(i) ? (
                        <td className="text-right text-xs text-[var(--muted)]">
                          {yearlyYield(i) === null ? (
                            <Link
                              href="/positions"
                              className="text-[var(--accent)] hover:underline"
                              title="Cash and stablecoins earn nothing unless they're paying interest. Set the rate and it shows here."
                            >
                              set rate
                            </Link>
                          ) : (
                            <span
                              className="text-[var(--green)]"
                              title={`${i.apr}% a year on ${fmt(i.value, currency)}`}
                            >
                              +{fmt(yearlyYield(i)!, currency)}/yr
                            </span>
                          )}
                        </td>
                      ) : i.atCost ? (
                        /* Sitting at its purchase price because nobody has
                           priced it. "+0.00" here would be a measurement — the
                           market hasn't moved — when nothing has been measured
                           at all. The dash says which. */
                        <td className="text-right text-[var(--muted)]" title="No price set yet, so there is nothing to compare the cost against. Set one on the Positions page.">
                          not priced
                        </td>
                      ) : (
                      <td
                        className="text-right"
                        style={{ color: i.pnl >= 0 ? "var(--green)" : "var(--red)" }}
                      >
                        {i.pnl >= 0 ? "+" : "−"}
                        {fmt(Math.abs(i.pnl), currency)}
                      </td>
                      )}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-xs text-[var(--muted)] py-8 text-center">
              Nothing matches these filters.
            </div>
          )}

          {filtered.length > 0 && (
            <div className="text-xs text-[var(--muted)] mt-3">
              {filtered.length} position{filtered.length === 1 ? "" : "s"} ·{" "}
              {fmt(total, currency)} held
              {totalNotional > total && ` · ${fmt(totalNotional, currency)} exposure`} ·{" "}
              <span style={{ color: totalPnl >= 0 ? "var(--green)" : "var(--red)" }}>
                {totalPnl >= 0 ? "+" : "−"}
                {fmt(Math.abs(totalPnl), currency)}
              </span>
              {/* A total that quietly omits rows looks exactly like one that
                  counted them at zero. This says which. */}
              {unpriced.length > 0 && (
                <span style={{ color: "var(--amber)" }}>
                  {" "}
                  · {unpriced.length} not priced yet, so left out of that figure
                </span>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="text-sm font-medium mb-3">Allocation</div>
          {allocation.length === 0 ? (
            <div className="text-xs text-[var(--muted)] py-8 text-center">Nothing to show.</div>
          ) : (
            <>
              <DonutChart data={allocation} currency={currency} />
              <p className="text-[10px] text-[var(--muted)] mt-3">
                {group === "none"
                  ? "By asset type"
                  : `By ${GROUP_OPTIONS.find((o) => o.value === group)?.label.toLowerCase()}`}
                , by capital committed, following the filters above.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
