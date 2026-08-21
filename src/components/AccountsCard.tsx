"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Money } from "@/components/PrivacyContext";
import { fmt } from "@/lib/format";
import {
  applyAccountFilters,
  filterOptions,
  DEFAULT_FILTERS,
  type AccountFilters,
  type FilterableAccount,
  type SortKey,
} from "@/lib/accounting/accountFilter";

/** Extra display-only fields the pure filter doesn't care about. */
export interface AccountRow extends FilterableAccount {
  equity: number;
  spot: number;
  unrealizedPnl: number;
  baseCurrency: string;
  /** How much of this account the market can move, in base currency. */
  floating: number;
  /** Equity locked behind open positions, for a leveraged account. */
  marginUsed: number;
  /** Why "free" is smaller than the balance, in words. */
  freeExplained?: string[];
  /** Share of this account's spare cash that is investing money, 0-100. */
  portfolioCashPercent?: number | null;
  /** The part of `spot` that sits outside the account's own value. */
  spotOnTop?: number;
  /**
   * The same figures in the base currency.
   *
   * Every amount on this card is shown in one currency; these are converted
   * once, by the page, rather than by each cell guessing at a rate.
   */
  baseValue: number | null;
  freeInBase?: number;
  equityInBase?: number;
  spotInBase?: number;
  pnlInBase?: number;
  /** Account value minus what can be traded with: committed to open trades. */
  inTrade?: number;
}

const TYPE_LABELS: Record<string, string> = {
  bank: "Bank",
  broker: "Broker",
  exchange: "Exchange",
  cash: "Cash",
  other: "Other",
};

export default function AccountsCard({ accounts }: { accounts: AccountRow[] }) {
  const [f, setF] = useState<AccountFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const options = useMemo(() => filterOptions(accounts), [accounts]);
  const rows = useMemo(() => applyAccountFilters(accounts, f) as AccountRow[], [accounts, f]);
  const hidden = accounts.length - rows.length;

  const set = (patch: Partial<AccountFilters>) => setF({ ...f, ...patch });

  /** Sorting moved into the filter panel now that there are no headers. */
  const SORTS: { key: SortKey; label: string }[] = [
    { key: "value", label: "Value" },
    { key: "free", label: "Free" },
    { key: "name", label: "Name" },
  ];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-sm font-medium">Accounts</div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          {showFilters ? "Hide filters" : "Filters"}
        </button>
      </div>

      {showFilters && (
        <div className="space-y-2 mb-3 pb-3 border-b border-[var(--border)]">
          <input
            value={f.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="Search name or institution"
            className="input text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={f.type}
              onChange={(e) => set({ type: e.target.value })}
              className="input text-xs"
            >
              <option value="">All types</option>
              {options.types.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t] ?? t}
                </option>
              ))}
            </select>
            <select
              value={f.currency}
              onChange={(e) => set({ currency: e.target.value })}
              className="input text-xs"
            >
              <option value="">All currencies</option>
              {options.currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={f.hideEmpty}
                onChange={(e) => set({ hideEmpty: e.target.checked })}
              />
              <span className="text-[var(--muted)]">Hide empty</span>
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={f.connectedOnly}
                onChange={(e) => set({ connectedOnly: e.target.checked })}
              />
              <span className="text-[var(--muted)]">Synced only</span>
            </label>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[var(--muted)]">Sort</span>
              {SORTS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() =>
                    set(
                      f.sort === o.key
                        ? { dir: f.dir === "asc" ? "desc" : "asc" }
                        : { sort: o.key, dir: "desc" }
                    )
                  }
                  className="px-1.5 rounded"
                  style={{
                    color: f.sort === o.key ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {o.label}
                  {f.sort === o.key && (f.dir === "asc" ? " ▲" : " ▼")}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setF(DEFAULT_FILTERS)}
                className="text-[var(--accent)] hover:underline"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cards rather than a table.
          Each account carries five or six related figures — value, the variable
          part, what's committed, what's free and why — and a table forces them
          into cells that can't be read as a group. Grouping them per account
          made the relationships visible, which is the whole point of showing
          them together. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
        {rows.map((a) => {
          const pnlUp = a.unrealizedPnl > 0;
          const variableShare =
            a.baseValue && a.baseValue > 0 ? Math.min(100, (a.floating / a.baseValue) * 100) : 0;

          return (
            <Link
              key={a.id}
              href={`/accounts/${a.id}`}
              className="rounded-xl border border-[var(--border)] p-3.5 hover:border-[var(--border-strong)] transition-colors block"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  <div className="text-[10px] text-[var(--muted)] truncate">
                    {a.institution}
                    {" · "}
                    {TYPE_LABELS[a.accountType] ?? a.accountType}
                    {a.connected && <span style={{ color: "var(--green)" }}> · synced</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-base font-semibold">
                    <Money value={a.baseValue ?? a.displayValue} currency={a.baseCurrency} />
                  </div>
                  {a.unrealizedPnl !== 0 && (
                    <div
                      className="text-[11px]"
                      style={{ color: pnlUp ? "var(--green)" : "var(--red)" }}
                    >
                      {pnlUp ? "+" : "−"}
                      {fmt(Math.abs(a.pnlInBase ?? a.unrealizedPnl), a.baseCurrency)}
                    </div>
                  )}
                  {/* One currency everywhere; the platform's own is a note. */}
                  {a.currency !== a.baseCurrency && (
                    <div className="text-[10px] text-[var(--muted)]">
                      {fmt(a.displayValue, a.currency)}
                    </div>
                  )}
                </div>
              </div>

              {/* How much of this account the market can move, as a bar. A
                  percentage in text is a number to decode; a bar is a glance. */}
              {variableShare > 0 && (
                <div className="mt-3">
                  <div
                    className="h-1 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <div
                      className="h-full"
                      style={{ width: `${variableShare}%`, background: "var(--amber)" }}
                    />
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-1">
                    {fmt(a.floating, a.baseCurrency)} can move with the market
                  </div>
                </div>
              )}

              <div className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-[10px] text-[var(--muted)]">Free</div>
                  <div className="text-sm">
                    <Money value={a.freeInBase ?? a.free} currency={a.baseCurrency} />
                  </div>
                </div>

                {a.inTrade !== undefined && a.inTrade > 0 && (
                  <div className="text-right">
                    <div className="text-[10px] text-[var(--muted)]">Committed to trades</div>
                    <div className="text-sm">{fmt(a.inTrade, a.baseCurrency)}</div>
                  </div>
                )}
              </div>

              {/* Every reason "free" is less than the balance. Listed rather
                  than summarised, because each one is a different constraint. */}
              {(a.freeExplained ?? []).length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {(a.freeExplained ?? []).map((line) => (
                    <li key={line} className="text-[10px] text-[var(--muted)] leading-snug">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          );
        })}
      </div>

      {hidden > 0 && (
        <div className="text-[10px] text-[var(--muted)] mt-2">
          {hidden} account{hidden === 1 ? "" : "s"} hidden by the filters
        </div>
      )}
    </div>
  );
}
