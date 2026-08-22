"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import DonutChart from "@/components/DonutChart";
import { fmt } from "@/lib/format";
import { tagLabel } from "@/lib/portfolio/tags";
import { shortName } from "@/lib/portfolio/shortName";
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
 * The columns on offer, in the order they appear when shown.
 *
 * `numeric` marks the ones that sit at the right-hand end and carry money. The
 * group header row spans everything before them, so it has to know which is
 * which rather than assuming the last two.
 */
const COLUMNS = [
  { key: "name", label: "Name", numeric: false },
  { key: "symbol", label: "Symbol", numeric: false },
  { key: "assetType", label: "Type", numeric: false },
  { key: "playlist", label: "Playlist", numeric: false },
  { key: "account", label: "Account", numeric: false },
  { key: "value", label: "At risk", numeric: true },
  // Profit on paper. Named in full because the app reports realised profit
  // elsewhere and the two must never be read as the same claim.
  { key: "pnl", label: "Unrealized P&L", numeric: true },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const DEFAULT_COLUMNS: ColumnKey[] = ["name", "assetType", "playlist", "account", "value", "pnl"];

const DEFAULT_WIDTHS: Record<string, number> = {
  name: 24,
  symbol: 24,
  assetType: 16,
  playlist: 20,
  account: 16,
  value: 14,
  // Wider than the others need to be: the heading is what makes the number
  // honest, so it must not be the thing that gets truncated away.
  pnl: 16,
};

const COLUMNS_STORAGE_KEY = "portfolio-table-columns";

/**
 * The chosen columns live in localStorage, which makes them external state.
 *
 * Reading them in an effect and calling setState would render the default set
 * first and the real one immediately after — a visible flash, and a cascading
 * render React now warns about. Reading them during render instead would
 * disagree with what the server rendered and break hydration. `useSyncExternal
 * Store` is the one path that does neither: the server snapshot is the default
 * and the client's is whatever was saved.
 */
let columnPref: ColumnKey[] | null = null;
const columnListeners = new Set<() => void>();

function readColumnPref(): ColumnKey[] {
  // Cached because getSnapshot must return a stable reference or React loops.
  if (columnPref) return columnPref;
  try {
    const saved = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as unknown) : null;
    // Filtered against the current column set: a key that no longer exists
    // would otherwise render an empty column for good.
    const known = Array.isArray(parsed)
      ? parsed.filter((k): k is ColumnKey => COLUMNS.some((c) => c.key === k))
      : [];
    columnPref = known.length > 0 ? known : DEFAULT_COLUMNS;
  } catch {
    // A corrupted preference is not worth a broken table.
    columnPref = DEFAULT_COLUMNS;
  }
  return columnPref;
}

function writeColumnPref(next: ColumnKey[]) {
  columnPref = next;
  try {
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing, a full quota — the table still works, it just forgets.
  }
  for (const listener of columnListeners) listener();
}

function subscribeToColumns(callback: () => void) {
  columnListeners.add(callback);
  return () => {
    columnListeners.delete(callback);
  };
}

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
   * Which columns are shown, remembered between visits.
   *
   * `symbol` is off by default and that is the point of this whole control. For
   * a coin it holds "BTC"; for anything imported from a broker statement it
   * holds the full legal name — "iShares VII plc - iShares Core S&P 500 UCITS
   * ETF USD (Acc)" — because the CSV route has no ticker to import. Twelve of
   * those wrapped mid-word made the table unreadable. `name` shows the
   * shortened form instead and keeps the full string one hover away, so nothing
   * is lost by defaulting to it.
   */
  const visible = useSyncExternalStore(
    subscribeToColumns,
    readColumnPref,
    () => DEFAULT_COLUMNS
  );
  const [showColumns, setShowColumns] = useState(false);

  const toggleColumn = (key: ColumnKey) => {
    const next = visible.includes(key)
      ? visible.filter((k) => k !== key)
      : COLUMNS.filter((c) => c.key === key || visible.includes(c.key)).map((c) => c.key);
    // Never leave nothing to look at.
    if (next.length === 0) return;
    writeColumnPref(next);
  };

  const shown = COLUMNS.filter((c) => visible.includes(c.key));

  /**
   * Column widths in percent, draggable.
   *
   * Fixed widths were a guess that suited my test data and not your symbols —
   * "Interactive Brokers" was truncated to "Interactive …" for every row.
   * Dragging beats me guessing better.
   *
   * Kept per column key rather than by position, so hiding a column doesn't
   * hand its width to whatever moved into its slot.
   */
  const [widthByKey, setWidthByKey] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const dragging = useRef<{ index: number; startX: number; startW: number; nextW: number } | null>(
    null
  );

  // Percentages have to add to 100 across whatever is actually shown, or the
  // table's last column runs off the edge as soon as one is hidden.
  const scale = shown.reduce((s, c) => s + (widthByKey[c.key] ?? 12), 0) || 1;
  const widths = shown.map((c) => ((widthByKey[c.key] ?? 12) / scale) * 100);

  /** How many columns the group label spans: everything before the money. */
  const labelSpan = shown.filter((c) => !c.numeric).length;

  const onMove = useCallback((e: MouseEvent) => {
    const d = dragging.current;
    if (!d) return;
    // Percent of the table, so the layout stays fluid at any window size.
    const table = document.getElementById("portfolio-table");
    const width = table?.clientWidth ?? 1;
    const delta = ((e.clientX - d.startX) / width) * 100;
    // A column can't eat its neighbour entirely; 6% keeps a header readable.
    const grow = Math.max(-d.startW + 6, Math.min(d.nextW - 6, delta));
    setWidthByKey((w) => {
      // Read from the store, not from a closure: these handlers bind to the
      // window once and would otherwise resize against a stale column list.
      const current = readColumnPref();
      const cols = COLUMNS.filter((c) => current.includes(c.key));
      const a = cols[d.index];
      const b = cols[d.index + 1];
      if (!a || !b) return w;
      return { ...w, [a.key]: d.startW + grow, [b.key]: d.nextW - grow };
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowColumns(!showColumns)}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            {showColumns ? "Hide columns" : "Columns"}
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            {showFilters ? "Hide filters" : "Filters"}
          </button>
        </div>
      </div>

      {showColumns && (
        <div className="flex gap-3 flex-wrap items-center pb-3 border-b border-[var(--border)]">
          {COLUMNS.map((c) => (
            <label key={c.key} className="text-xs flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={visible.includes(c.key)}
                onChange={() => toggleColumn(c.key)}
              />
              <span className={visible.includes(c.key) ? undefined : "text-[var(--muted)]"}>
                {c.label}
              </span>
            </label>
          ))}
          <span className="text-[10px] text-[var(--muted)] ml-auto">
            Remembered on this device. &ldquo;Symbol&rdquo; is the full name as your broker wrote
            it; &ldquo;Name&rdquo; is the short form, with the full one on hover.
          </span>
        </div>
      )}

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
                {shown.map((c, i) => (
                  <th
                    key={c.key}
                    className={c.numeric ? "text-right" : undefined}
                    style={{ position: "relative" }}
                  >
                    {c.label}
                    {/* Drag the edge between two columns. The pair shares a
                        fixed total, so widening one narrows its neighbour and
                        the table never overflows into a scrollbar. */}
                    {i < shown.length - 1 && (
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
                      {/* Spans every column before the money, whichever those
                          happen to be — hiding one used to leave the group's
                          total sitting under the wrong heading. */}
                      {labelSpan > 0 && (
                        <td colSpan={labelSpan} className="font-medium text-xs">
                          {label(g.key)}
                          <span className="text-[var(--muted)] ml-2">
                            {g.items.length} · {g.percent}%
                          </span>
                        </td>
                      )}
                      {visible.includes("value") && (
                        <td className="text-right font-medium text-xs">{fmt(g.value, currency)}</td>
                      )}
                      {visible.includes("pnl") && (
                        <td
                          className="text-right text-xs"
                          style={{ color: g.pnl >= 0 ? "var(--green)" : "var(--red)" }}
                        >
                          {g.pnl >= 0 ? "+" : "−"}
                          {fmt(Math.abs(g.pnl), currency)}
                        </td>
                      )}
                    </tr>
                  )}
                  {g.items.map((i) => (
                    <tr key={i.id}>
                      {shown.map((c) => {
                        const badges = c.key === shown[0]?.key && (
                          <>
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
                            {/* The value in this row is what it cost, not what
                                it is worth. Said on the row itself, because a
                                column of market values with one cost hidden
                                among them is worse than no column at all. */}
                            {i.atCost && (
                              <span
                                className="text-[10px] ml-1"
                                style={{ color: "var(--amber)" }}
                                title="Rebuilt from an imported statement. The quantity is exact; the figure shown is what you paid, because the statement carries no current price."
                              >
                                at cost
                              </span>
                            )}
                          </>
                        );

                        switch (c.key) {
                          case "name":
                            return (
                              // The full stored name stays on hover, which is
                              // what makes shortening it safe.
                              <td key={c.key} className="font-medium" title={i.symbol}>
                                <span className="break-words">{shortName(i.symbol)}</span>
                                {badges}
                              </td>
                            );
                          case "symbol":
                            return (
                              <td key={c.key} className="font-medium">
                                <span className="break-all">{i.symbol}</span>
                                {badges}
                              </td>
                            );
                          case "assetType":
                            return (
                              <td key={c.key} className="text-xs text-[var(--muted)]">
                                {i.assetType ? (
                                  tagLabel(i.assetType) ?? i.assetType
                                ) : (
                                  <Link
                                    href="/positions"
                                    className="text-[var(--accent)] hover:underline"
                                  >
                                    set type
                                  </Link>
                                )}
                                {badges}
                              </td>
                            );
                          case "playlist":
                            return (
                              <td
                                key={c.key}
                                className="text-xs text-[var(--muted)] truncate"
                                title={i.playlistName ?? undefined}
                              >
                                {i.playlistName ?? "—"}
                                {badges}
                              </td>
                            );
                          case "account":
                            return (
                              <td
                                key={c.key}
                                className="text-xs text-[var(--muted)] truncate"
                                title={i.accountName}
                              >
                                {i.accountName}
                                {badges}
                              </td>
                            );
                          case "value":
                            return (
                              <td key={c.key} className="text-right">
                                {fmt(i.value, currency)}
                                {/* Leverage means the position controls far more
                                    than it cost you. Showing the notional as
                                    "value" would overstate the portfolio by the
                                    leverage factor. */}
                                {i.leverage !== null && i.leverage > 1 && (
                                  <div className="text-[10px] text-[var(--muted)]">
                                    {i.leverage}× · {fmt(i.notional, currency)}
                                  </div>
                                )}
                              </td>
                            );
                          case "pnl":
                            /* Cash and stablecoins have no P&L: the price
                               doesn't move. A column of +0,00 € invites you to
                               read a number that means nothing. */
                            if (!hasPnl(i)) {
                              return (
                                <td key={c.key} className="text-right text-xs text-[var(--muted)]">
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
                              );
                            }
                            if (i.costUnknown) {
                              /* The venue reports what this is worth and not
                                 what it cost. "+0,00" would say the holding is
                                 exactly flat — a measurement — when the entry
                                 price was never stated at all. */
                              return (
                                <td
                                  key={c.key}
                                  className="text-right text-[var(--muted)] text-xs"
                                  title="This platform doesn't report what the holding cost, so there is nothing to compare today's value against."
                                >
                                  no cost basis
                                </td>
                              );
                            }
                            if (i.atCost) {
                              /* Sitting at its purchase price because nobody has
                                 priced it. "+0.00" here would be a measurement —
                                 the market hasn't moved — when nothing has been
                                 measured at all. The words say which. */
                              return (
                                <td
                                  key={c.key}
                                  className="text-right text-[var(--muted)]"
                                  title="No price set yet, so there is nothing to compare the cost against. Set one on the Positions page."
                                >
                                  not priced
                                </td>
                              );
                            }
                            return (
                              <td
                                key={c.key}
                                className="text-right"
                                style={{ color: i.pnl >= 0 ? "var(--green)" : "var(--red)" }}
                              >
                                {i.pnl >= 0 ? "+" : "−"}
                                {fmt(Math.abs(i.pnl), currency)}
                              </td>
                            );
                        }
                      })}
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
